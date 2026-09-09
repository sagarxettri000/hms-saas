import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import * as net from "net";
import { PrismaService } from "../../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { DicomService, DicomUploadFile } from "../dicom.service";

import {
  COMMAND_FIELD,
  PDU_TYPE,
  STATUS,
  TRANSFER_SYNTAXES,
  buildAssociateAc,
  buildAssociateRj,
  buildCommandSetPData,
  buildReleaseRqOrRp,
  parseAssociateRq,
  parseDatasetImplicitLe,
  parsePDataTf,
  parsePduHeader,
  AcContext,
  DimseCommand,
  NegotiatedContext,
} from "./dicom-ulp";
import { wrapDatasetInP10, unwrapP10 } from "./p10-util";

export interface StoreCommand extends DimseCommand {
  contextId: number;
  transferSyntax: string;
  fragments: Buffer[];
}

export interface PendingCStore {
  command: DimseCommand;
  fragments: Buffer[];
  transferSyntax: string;
}

export interface ScpStats {
  startedAt: string;
  associations: number;
  rejectedAssociations: number;
  storedInstances: number;
  failedInstances: number;
  echoRequests: number;
  lastError?: string;
}

const SUPPORTED_STORE_ABSTRACT_SYNTAX_PREFIX = "1.2.840.10008.5.1.4";

@Injectable()
export class DicomScpService {
  private readonly logger = new Logger(DicomScpService.name);
  private server?: net.Server;
  private node?: { id: string; aeTitle: string; hostname: string; port: number };
  private stats: ScpStats = {
    startedAt: "",
    associations: 0,
    rejectedAssociations: 0,
    storedInstances: 0,
    failedInstances: 0,
    echoRequests: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly dicomService: DicomService,
    private readonly storage: StorageService,
  ) {}

  async start(nodeId: string, tenantId: string): Promise<void> {
    await this.stop();

    const node = await this.prisma.dicomNode.findFirst({ where: { id: nodeId, tenantId } });
    if (!node) throw new Error("DICOM node not found");
    if (!node.isLocal) throw new Error("Only local nodes can run a listener");

    const port = node.port || 104;

    this.stats = {
      startedAt: new Date().toISOString(),
      associations: 0,
      rejectedAssociations: 0,
      storedInstances: 0,
      failedInstances: 0,
      echoRequests: 0,
    };
    this.node = { id: node.id, aeTitle: node.aeTitle, hostname: node.hostname, port };

    const server = net.createServer((socket) => {
      this.handleSocket(socket, tenantId);
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", (err) => reject(err));
      server.listen(port, node.hostname || "0.0.0.0", () => {
        server.removeListener("error", reject);
        this.logger.log(`DICOM SCP listener "${node.aeTitle}" on ${node.hostname || "0.0.0.0"}:${port}`);
        resolve();
      });
    });

    this.server = server;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.node = undefined;
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      this.logger.log("DICOM SCP listener stopped");
    }
  }

  isRunning(): boolean {
    return Boolean(this.server);
  }

  getStats(): ScpStats & { node?: { aeTitle: string; port: number } | undefined } {
    return {
      ...this.stats,
      ...(this.node ? { node: { aeTitle: this.node.aeTitle, port: this.node.port } } : {}),
    };
  }

  private handleSocket(socket: net.Socket, tenantId: string) {
    socket.setTimeout(60000);
    socket.on("timeout", () => socket.destroy());
    socket.on("error", (err) => {
      this.logger.debug(`SCP socket error: ${err.message}`);
      this.stats.lastError = err.message;
    });

    let recvBuffer = Buffer.alloc(0);
    let contexts: NegotiatedContext[] = [];
    let pendingStore = new Map<number, PendingCStore>();
    let peerAe = "";
    let calledAe = "";

    const sendPdu = (pdu: Buffer) => {
      if (!socket.destroyed) socket.write(pdu);
    };

    const reset = () => {
      contexts = [];
      pendingStore = new Map();
      recvBuffer = Buffer.alloc(0);
    };

    const releaseAssociation = () => {
      sendPdu(buildReleaseRqOrRp(PDU_TYPE.A_RELEASE_RP));
      reset();
    };

    socket.on("close", () => reset());

    socket.on("data", (chunk: Buffer) => {
      recvBuffer = Buffer.concat([recvBuffer, chunk]);

      while (recvBuffer.length >= 6) {
        let header: { type: number; length: number; dataOffset: number };
        try {
          header = parsePduHeader(recvBuffer, 0);
        } catch {
          sendPdu(buildReleaseRqOrRp(PDU_TYPE.A_ABORT_RQ));
          socket.destroy();
          return;
        }

        const pduLength = header.length;
        if (recvBuffer.length < header.dataOffset + pduLength) break; // wait for more

        const pdu = recvBuffer.subarray(0, header.dataOffset + pduLength);
        try {
          this.dispatchPdu(header, pdu, tenantId, contexts, pendingStore, {
            sendPdu,
            onPeerAe: (ae) => (peerAe = ae),
            onCalledAe: (ae) => (calledAe = ae),
            onAcceptAssociation: (ctxs) => {
              contexts = ctxs;
              pendingStore = new Map();
              this.stats.associations += 1;
            },
            echo: () => (this.stats.echoRequests += 1),
            store: (cmd) => this.storeInstance(cmd, tenantId, sendPdu),
          });
        } catch (err) {
          this.logger.error(`SCP error handling PDU: ${(err as Error).message}`);
          this.stats.lastError = (err as Error).message;
          this.stats.failedInstances += 1;
          sendPdu(buildReleaseRqOrRp(PDU_TYPE.A_ABORT_RQ));
          socket.destroy();
          return;
        }

        recvBuffer = recvBuffer.subarray(header.dataOffset + pduLength);
        void peerAe;
        void calledAe;
      }
    });
  }

  private dispatchPdu(
    header: { type: number; length: number; dataOffset: number },
    pdu: Buffer,
    tenantId: string,
    contexts: NegotiatedContext[],
    pendingStore: Map<number, PendingCStore>,
    actions: {
      sendPdu: (pdu: Buffer) => void;
      onPeerAe: (ae: string) => void;
      onCalledAe: (ae: string) => void;
      onAcceptAssociation: (ctxs: NegotiatedContext[]) => void;
      echo: () => void;
      store: (cmd: StoreCommand) => void;
    },
  ) {
    switch (header.type) {
      case PDU_TYPE.A_ASSOCIATE_RQ: {
        const req = parseAssociateRq(pdu, header.dataOffset, header.length);
        actions.onPeerAe(req.callingAeTitle);
        actions.onCalledAe(req.calledAeTitle);

        const accepted: AcContext[] = [];
        for (const pc of req.presentationContexts) {
          const acceptTs = pickTransferSyntax(pc.transferSyntaxUids);
          if (acceptTs) {
            accepted.push({ id: pc.id, result: 0x00, transferSyntaxUid: acceptTs });
          } else {
            accepted.push({ id: pc.id, result: 0x02, transferSyntaxUid: TRANSFER_SYNTAXES.IMPLICIT_VR_LE });
          }
        }

        if (!accepted.some((c) => c.result === 0x00)) {
          this.stats.rejectedAssociations += 1;
          actions.sendPdu(buildAssociateRj(0x01));
          return;
        }

        const ac = buildAssociateAc(req, accepted, "1.2.826.0.1.3680043.8.498.2026", "HMS-SCP-1.0");
        actions.sendPdu(ac);

        const negotiated: NegotiatedContext[] = accepted
          .filter((c) => c.result === 0x00)
          .map((c) => ({
            id: c.id,
            abstractSyntaxUid:
              req.presentationContexts.find((pc) => pc.id === c.id)?.abstractSyntaxUid || "",
            transferSyntaxUid: c.transferSyntaxUid,
          }));
        actions.onAcceptAssociation(negotiated);
        return;
      }

      case PDU_TYPE.P_DATA_TF: {
        const pdvs = parsePDataTf(pdu, header.dataOffset, header.length);
        for (const pdv of pdvs) {
          const isCommand = (pdv.controlHeader & 0x01) === 0x00;
          const isLast = (pdv.controlHeader & 0x02) !== 0;

          if (isCommand) {
            const cmdAttrs = parseDatasetImplicitLe(pdv.data, 0, pdv.data.length);
            const cmd = attrsToCommand(cmdAttrs);
            void cmd;

            // Successfully parsed command PDV; handle request commands.
            this.handleCommand(cmd, pdv.contextId, contexts, pendingStore, tenantId, actions);
          } else {
            const pending = pendingStore.get(pdv.contextId);
            if (pending) {
              pending.fragments.push(pdv.data);
              if (isLast) {
                pendingStore.delete(pdv.contextId);
                actions.store({
                  ...pending.command,
                  contextId: pdv.contextId,
                  transferSyntax: pending.transferSyntax,
                  fragments: pending.fragments,
                });
              }
            }
          }
        }
        return;
      }

      case PDU_TYPE.A_RELEASE_RQ: {
        actions.sendPdu(buildReleaseRqOrRp(PDU_TYPE.A_RELEASE_RP));
        return;
      }

      case PDU_TYPE.A_ABORT_RQ:
      case PDU_TYPE.A_P_ABORT:
      default:
        return;
    }
  }

  private handleCommand(
    cmd: DimseCommand,
    contextId: number,
    contexts: NegotiatedContext[],
    pendingStore: Map<number, PendingCStore>,
    tenantId: string,
    actions: {
      sendPdu: (pdu: Buffer) => void;
      echo: () => void;
    },
  ) {
    const context = contexts.find((c) => c.id === contextId);

    if (cmd.commandField === COMMAND_FIELD.C_ECHO_RQ) {
      actions.echo();
      const rsp: DimseCommand = {
        commandField: COMMAND_FIELD.C_ECHO_RSP,
        messageIdBeingRespondedTo: cmd.messageId,
        affectedSopClassUid: "1.2.840.10008.1.1",
        status: STATUS.SUCCESS,
        commandDataSetType: 0x0101,
      };
      actions.sendPdu(buildCommandSetPData(rsp, contextId));
      return;
    }

    if (cmd.commandField === COMMAND_FIELD.C_STORE_RQ) {
      const ts = context?.transferSyntaxUid || TRANSFER_SYNTAXES.IMPLICIT_VR_LE;
      pendingStore.set(contextId, {
        command: cmd,
        fragments: [],
        transferSyntax: ts,
      });
      return;
    }

    if (cmd.commandField === COMMAND_FIELD.C_STORE_RSP) {
      // Stores echoed by us (SCU side) are handled elsewhere.
      return;
    }

    // Unsupported command: respond with failed C-FIND-ish general failure
    actions.sendPdu(buildCommandSetPData({
      commandField: COMMAND_FIELD.C_STORE_RSP,
      messageIdBeingRespondedTo: cmd.messageId,
      affectedSopClassUid: cmd.affectedSopClassUid,
      affectedSopInstanceUid: cmd.affectedSopInstanceUid,
      status: STATUS.UL_UNRECOGNIZED_PDU,
      commandDataSetType: 0x0101,
    }, contextId));
    void tenantId;
  }

  private async storeInstance(
    cmd: StoreCommand,
    tenantId: string,
    sendPdu: (pdu: Buffer) => void,
  ) {
    const sopClass = cmd.affectedSopClassUid || "";
    const sopInstance = cmd.affectedSopInstanceUid || crypto.randomUUID();
    const supported = sopClass.startsWith(SUPPORTED_STORE_ABSTRACT_SYNTAX_PREFIX);
    let status: number = supported ? STATUS.SUCCESS : STATUS.UNKNOWN_SOP_CLASS;

    const respond = () => {
      const rsp: DimseCommand = {
        commandField: COMMAND_FIELD.C_STORE_RSP,
        messageIdBeingRespondedTo: cmd.messageId,
        affectedSopClassUid: sopClass,
        affectedSopInstanceUid: sopInstance,
        status,
        commandDataSetType: 0x0101,
      };
      sendPdu(buildCommandSetPData(rsp, cmd.contextId));
    };

    if (!supported) {
      respond();
      return;
    }

    try {
      const dataset = Buffer.concat(cmd.fragments);
      const p10 = wrapDatasetInP10(dataset, {
        sopClassUid: sopClass,
        sopInstanceUid: sopInstance,
        transferSyntaxUid: cmd.transferSyntax,
      });

      const file: DicomUploadFile = {
        buffer: p10,
        originalname: `${sopInstance}.dcm`,
        mimetype: "application/dicom",
        size: p10.length,
      };

      const result = await this.dicomService.upload({
        tenantId,
        userId: "system",
        files: [file],
      });

      this.stats.storedInstances += result.ingested.length;
    } catch (err) {
      this.stats.failedInstances += 1;
      this.stats.lastError = (err as Error).message;
      this.logger.error(`C-STORE store failed: ${(err as Error).message}`);
      status = STATUS.FAILURE;
    }

    respond();
  }
}

function pickTransferSyntax(provider: string[]): string | undefined {
  const preferred = [
    TRANSFER_SYNTAXES.IMPLICIT_VR_LE,
    TRANSFER_SYNTAXES.EXPLICIT_VR_LE,
    TRANSFER_SYNTAXES.JPEG_BASELINE_8,
    TRANSFER_SYNTAXES.JPEG_LOSSLESS_14,
    TRANSFER_SYNTAXES.RLE_LOSSLESS,
    TRANSFER_SYNTAXES.EXPLICIT_VR_BE,
  ];
  for (const ts of preferred) {
    if (provider.includes(ts)) return ts;
  }
  return provider[0];
}

function attrsToCommand(attrs: Array<{ tag: string; vr: string; value: unknown }>): DimseCommand {
  const cmd: DimseCommand = { commandField: 0 };
  for (const a of attrs) {
    const v = a.value;
    switch (a.tag) {
      case "00000100": cmd.commandField = Number(v) || 0; break;
      case "00000110": cmd.messageId = Number(v); break;
      case "00000120": cmd.messageIdBeingRespondedTo = Number(v); break;
      case "00000002": cmd.affectedSopClassUid = String(v); break;
      case "00001000": cmd.affectedSopInstanceUid = String(v); break;
      case "00000800": cmd.commandDataSetType = Number(v); break;
      case "00000700": cmd.priority = Number(v); break;
      case "00000900": cmd.status = Number(v); break;
      default: cmd[a.tag] = v;
    }
  }
  return cmd;
}

export { unwrapP10 };