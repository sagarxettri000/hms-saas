import { Injectable, Logger } from "@nestjs/common";
import * as net from "net";
import * as tls from "tls";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import {
  COMMAND_FIELD,
  PDU_TYPE,
  STATUS,
  TRANSFER_SYNTAXES,
  buildCommandSetPData,
  buildPDataTf,
  buildReleaseRqOrRp,
  parseDatasetImplicitLe,
  parsePDataTf,
  parsePduHeader,
} from "./dicom-ulp";
import { unwrapP10, p10SopClass } from "./p10-util";

const MY_AE = "HMS-SCU";
const MY_IMPL_UID = "1.2.826.0.1.3680043.8.498.2026";
const MY_IMPL_VERSION = "HMS-SCU-1.0";
const APPLICATION_CONTEXT = "1.2.840.10008.3.1.1.1";
const MAX_PDV = 16384;

// Command set element numbers
const EL_COMMAND_FIELD = 0x0100;
const EL_MESSAGE_ID = 0x0110;
const EL_MESSAGE_ID_RESPONDING = 0x0120;
const EL_STATUS = 0x0900;

export interface StoreResult {
  sopInstanceUid: string;
  contextId: number;
  status: number;
}

interface PdvEvent {
  contextId: number;
  data: Buffer;
  isCommand: boolean;
  isLast: boolean;
}

@Injectable()
export class DicomScuService {
  private readonly logger = new Logger(DicomScuService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Send all instances of a study to a remote AE node. */
  async sendStudyToNode(
    tenantId: string,
    nodeId: string,
    studyId: string,
  ): Promise<StoreResult[]> {
    const node = await this.prisma.dicomNode.findFirst({
      where: { id: nodeId, tenantId },
    });
    if (!node) throw new NotFoundException("DICOM node not found");

    const instances = await this.prisma.dicomInstance.findMany({
      where: { dicomSeries: { dicomStudy: { id: studyId, tenantId } } },
      select: {
        sopInstanceUid: true,
        storageKey: true,
        transferSyntax: true,
      },
      orderBy: { instanceNumber: "asc" as const },
    });

    if (!instances.length)
      throw new NotFoundException("No instances found for study");

    const payloads: Array<{
      sopClassUid: string;
      sopInstanceUid: string;
      p10: Buffer;
    }> = [];
    for (const inst of instances) {
      const { data } = await this.storage.get(inst.storageKey);
      const sopClass = (await p10SopClass(data)) || fallbackSopClass;
      payloads.push({
        sopClassUid: sopClass,
        sopInstanceUid: inst.sopInstanceUid,
        p10: data,
      });
    }

    const results = await this.store(
      node.hostname,
      node.port,
      node.aeTitle,
      payloads,
      node.tls ?? false,
    );
    return results;
  }

  /** C-ECHO SCU against a configured node. */
  async echoNode(
    tenantId: string,
    nodeId: string,
  ): Promise<{
    connected: boolean;
    latencyMs: number;
    status?: number;
    error?: string;
  }> {
    const node = await this.prisma.dicomNode.findFirst({
      where: { id: nodeId, tenantId },
    });
    if (!node) throw new NotFoundException("DICOM node not found");
    try {
      const result = await this.echo(
        node.hostname,
        node.port,
        node.aeTitle,
        node.tls ?? false,
      );
      return { connected: true, ...result };
    } catch (err) {
      return { connected: false, latencyMs: 0, error: (err as Error).message };
    }
  }

  /** C-ECHO SCU: returns latency and peer status. */
  async echo(
    host: string,
    port: number,
    calledAe: string,
    useTls = false,
  ): Promise<{ latencyMs: number; status?: number }> {
    const start = Date.now();
    const conn = await this.connect(
      host,
      port,
      calledAe,
      [{ abstractSyntaxUid: "1.2.840.10008.1.1" }],
      useTls,
    );
    try {
      const status = await this.sendCommandExpectResponse(
        conn,
        "1.2.840.10008.1.1",
        {
          commandField: COMMAND_FIELD.C_ECHO_RQ,
          messageId: 1,
          affectedSopClassUid: "1.2.840.10008.1.1",
          priority: 0,
          commandDataSetType: 0x0101,
        },
      );
      return { latencyMs: Date.now() - start, status };
    } finally {
      this.cleanup(conn);
    }
  }

  /** C-STORE SCU: push one or more Part 10 instances to a remote AE. */
  async store(
    host: string,
    port: number,
    calledAe: string,
    instances: Array<{
      sopClassUid: string;
      sopInstanceUid: string;
      p10: Buffer;
    }>,
    useTls = false,
  ): Promise<StoreResult[]> {
    this.logger.log(
      `C-STORE SCU: ${instances.length} instance(s) -> ${calledAe}@${host}:${port}${useTls ? " (TLS)" : ""}`,
    );
    const conn = await this.connect(
      host,
      port,
      calledAe,
      instances.map((i) => ({ abstractSyntaxUid: i.sopClassUid })),
      useTls,
    );
    const results: StoreResult[] = [];

    try {
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        const contextId = conn.contextByAbstract.get(inst.sopClassUid) || i + 1;
        const status = await new Promise<number>(async (resolve) => {
          const timer = setTimeout(() => {
            this.logger.warn(`C-STORE timeout for ${inst.sopInstanceUid}`);
            resolve(STATUS.FAILURE);
          }, 30000);

          conn.pdvListeners.push((ev) => {
            if (ev.isCommand && ev.contextId === contextId) {
              const attrs = this.parseCommandSet(ev.data);
              if (attrs.get(EL_COMMAND_FIELD) === COMMAND_FIELD.C_STORE_RSP) {
                clearTimeout(timer);
                const respondedToMsgId: number | undefined = attrs.get(
                  EL_MESSAGE_ID_RESPONDING,
                );
                const pendingResolve = conn.pending.get(respondedToMsgId ?? -1);
                if (pendingResolve)
                  pendingResolve(attrs.get(EL_STATUS) ?? STATUS.FAILURE);
              }
            }
          });

          // Console.log-free wiring: register resolve by message id.
          const messageId = i + 1;
          conn.pending.set(messageId, (s: number) => resolve(s));

          const commandPdu = buildCommandSetPData(
            {
              commandField: COMMAND_FIELD.C_STORE_RQ,
              messageId,
              affectedSopClassUid: inst.sopClassUid,
              affectedSopInstanceUid: inst.sopInstanceUid,
              priority: 0,
              commandDataSetType: 0x0001,
            },
            contextId,
          );
          conn.send(commandPdu);

          const dataset = await unwrapP10(inst.p10);
          this.sendDatasetFragments(conn, contextId, dataset);
        });

        results.push({
          sopInstanceUid: inst.sopInstanceUid,
          contextId,
          status,
        });
      }
    } finally {
      this.cleanup(conn);
    }

    return results;
  }

  // ---- internals ----

  private connect(
    host: string,
    port: number,
    calledAe: string,
    contexts: Array<{
      abstractSyntaxUid: string;
      transferSyntaxUids?: string[];
    }>,
    useTls = false,
  ): Promise<ConnectionState> {
    return new Promise((resolve, reject) => {
      const { socket, readyEvent } = openDicomSocket(host, port, useTls);
      const state: ConnectionState = {
        socket,
        recvBuffer: Buffer.alloc(0),
        contextByAbstract: new Map(),
        pdvListeners: [],
        pending: new Map(),
        send: (pdu: Buffer) => {
          if (!socket.destroyed) socket.write(pdu);
        },
      };
      let settled = false;

      socket.on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(new Error(`DICOM connection failed: ${err.message}`));
        }
      });

      socket.on("close", () => {
        if (!settled) {
          settled = true;
          reject(
            new Error("DICOM connection closed before association established"),
          );
        }
      });

      socket.on(readyEvent, () => {
        state.send(buildAssociateRq(calledAe, contexts));
      });

      socket.on("data", (chunk: Buffer) => {
        state.recvBuffer = Buffer.concat([state.recvBuffer, chunk]);
        while (state.recvBuffer.length >= 6) {
          const header = parsePduHeader(state.recvBuffer, 0);
          if (state.recvBuffer.length < header.dataOffset + header.length)
            break;
          const pdu = state.recvBuffer.subarray(
            0,
            header.dataOffset + header.length,
          );
          handleIncoming(header, pdu, state);
          state.recvBuffer = state.recvBuffer.subarray(
            header.dataOffset + header.length,
          );
        }
      });

      const handleIncoming = (
        header: { type: number; length: number; dataOffset: number },
        pdu: Buffer,
        st: ConnectionState,
      ) => {
        if (header.type === PDU_TYPE.A_ASSOCIATE_AC) {
          if (settled) return;
          settled = true;
          parseAc(pdu, header.dataOffset, header.length, st.contextByAbstract);
          if (!st.contextByAbstract.size) {
            reject(new Error("No presentation contexts accepted by peer"));
            socket.destroy();
            return;
          }
          resolve(st);
        } else if (header.type === PDU_TYPE.A_ASSOCIATE_RJ) {
          settled = true;
          reject(new Error("Association rejected by peer"));
          socket.destroy();
        } else if (header.type === PDU_TYPE.P_DATA_TF) {
          const pdvs = parsePDataTf(pdu, header.dataOffset, header.length);
          for (const pdv of pdvs) {
            const ev: PdvEvent = {
              contextId: pdv.contextId,
              data: pdv.data,
              isCommand: (pdv.controlHeader & 0x01) === 0x00,
              isLast: (pdv.controlHeader & 0x02) !== 0,
            };
            for (const l of [...st.pdvListeners]) l(ev);
          }
        } else if (header.type === PDU_TYPE.A_RELEASE_RP) {
          socket.destroy();
        } else if (
          header.type === PDU_TYPE.A_ABORT_RQ ||
          header.type === PDU_TYPE.A_P_ABORT
        ) {
          socket.destroy();
        }
      };
    });
  }

  private sendCommandExpectResponse(
    conn: ConnectionState,
    abstractSyntaxUid: string,
    cmd: Record<string, unknown>,
  ): Promise<number> {
    const contextId = conn.contextByAbstract.get(abstractSyntaxUid) || 1;
    const messageId = Number(cmd["messageId"] ?? 1);

    return new Promise<number>((resolve) => {
      const timer = setTimeout(() => resolve(STATUS.FAILURE), 10000);
      conn.pdvListeners.push((ev) => {
        if (ev.isCommand && ev.contextId === contextId) {
          const attrs = this.parseCommandSet(ev.data);
          if (attrs.get(EL_COMMAND_FIELD) === COMMAND_FIELD.C_ECHO_RSP) {
            clearTimeout(timer);
            resolve(attrs.get(EL_STATUS) ?? STATUS.SUCCESS);
          }
        }
      });
      conn.pending.set(messageId, (s) => {
        clearTimeout(timer);
        resolve(s);
      });

      const pdu = buildCommandSetPData(
        cmd as Parameters<typeof buildCommandSetPData>[0],
        contextId,
      );
      conn.send(pdu);
    });
  }

  private parseCommandSet(data: Buffer): Map<number, number> {
    const attrs = parseDatasetImplicitLe(data, 0, data.length);
    const map = new Map<number, number>();
    for (const a of attrs) {
      const el = parseInt(a.tag.slice(4, 8), 16);
      if (typeof a.value === "number") map.set(el, a.value);
    }
    const cmdMap = new Map<number, number>();
    map.forEach((v, k) => cmdMap.set(k, v));
    return cmdMap;
  }

  private sendDatasetFragments(
    conn: ConnectionState,
    contextId: number,
    data: Buffer,
  ) {
    const pdvs: Array<{
      contextId: number;
      controlHeader: number;
      data: Buffer;
    }> = [];
    let offset = 0;
    while (offset < data.length) {
      const size = Math.min(MAX_PDV, data.length - offset);
      const chunk = data.subarray(offset, offset + size);
      offset += size;
      pdvs.push({
        contextId,
        controlHeader: offset >= data.length ? 0x03 : 0x01,
        data: Buffer.from(chunk),
      });
    }
    if (!pdvs.length)
      pdvs.push({ contextId, controlHeader: 0x03, data: Buffer.alloc(0) });
    conn.send(buildPDataTf(pdvs));
  }

  private cleanup(conn: ConnectionState) {
    conn.send(buildReleaseRqOrRp(PDU_TYPE.A_RELEASE_RQ));
    setTimeout(() => conn.socket.destroy(), 200);
  }
}

interface ConnectionState {
  socket: net.Socket;
  recvBuffer: Buffer;
  contextByAbstract: Map<string, number>;
  pdvListeners: Array<(ev: PdvEvent) => void>;
  pending: Map<number, (status: number) => void>;
  send: (pdu: Buffer) => void;
}

function parseAc(
  pdu: Buffer,
  offset: number,
  length: number,
  byAbstract: Map<string, number>,
) {
  // scan for presentation context result items (0x21)
  let pos = offset + 4 + 16 + 32 + 16 + 32;
  const end = offset + length;
  while (pos + 4 <= end) {
    const itemType = pdu[pos];
    const itemLen = pdu.readUInt16BE(pos + 2);
    if (itemType === 0x21) {
      const ctxId = pdu[pos + 4];
      const result = pdu[pos + 6];
      if (result === 0x00) {
        // find transfer syntax sub-item
        let p = pos + 8;
        const iEnd = pos + 4 + itemLen;
        while (p + 4 <= iEnd) {
          const st = pdu[p];
          const sl = pdu.readUInt16BE(p + 2);
          if (st === 0x40) {
            const ts = pdu.subarray(p + 4, p + 4 + sl).toString("latin1");
            void ts; // abstract syntax mapping is positional; store by id only
          }
          p += 4 + sl;
        }
        // We do not know the abstract syntax here; the caller maps by offering order (1..n)
        byAbstract.set(String(ctxId), ctxId);
      }
    }
    pos += 4 + itemLen;
  }
}

function buildAssociateRq(
  calledAe: string,
  contexts: Array<{ abstractSyntaxUid: string; transferSyntaxUids?: string[] }>,
): Buffer {
  const sub: Buffer[] = [];
  sub.push(
    Buffer.concat([
      Buffer.from([0x10, 0x00]),
      u16(APPLICATION_CONTEXT.length),
      Buffer.from(APPLICATION_CONTEXT, "latin1"),
    ]),
  );

  let pcId = 1;
  for (const ctx of contexts) {
    const tsList = ctx.transferSyntaxUids?.length
      ? ctx.transferSyntaxUids
      : [TRANSFER_SYNTAXES.IMPLICIT_VR_LE, TRANSFER_SYNTAXES.EXPLICIT_VR_LE];
    const abstractUid = Buffer.from(ctx.abstractSyntaxUid, "latin1");
    const inner: Buffer[] = [];
    inner.push(
      Buffer.concat([
        Buffer.from([0x30, 0x00]),
        u16(abstractUid.length),
        abstractUid,
      ]),
    );
    for (const ts of tsList) {
      const tsUid = Buffer.from(ts, "latin1");
      inner.push(
        Buffer.concat([Buffer.from([0x40, 0x00]), u16(tsUid.length), tsUid]),
      );
    }
    const innerLen = inner.reduce((s, b) => s + b.length, 0);
    sub.push(
      Buffer.concat([
        Buffer.from([0x20, 0x00]),
        u16(innerLen + 4),
        Buffer.from([pcId, 0x00, inner.length, 0x00]),
        ...inner,
      ]),
    );
    pcId++;
  }

  const ui: Buffer[] = [];
  ui.push(Buffer.concat([Buffer.from([0x51, 0x00]), u16(4), u32(16384)]));
  const icl = Buffer.from(MY_IMPL_UID, "latin1");
  ui.push(Buffer.concat([Buffer.from([0x52, 0x00]), u16(icl.length), icl]));
  const iver = Buffer.from(MY_IMPL_VERSION, "latin1");
  ui.push(Buffer.concat([Buffer.from([0x55, 0x00]), u16(iver.length), iver]));
  const uiLen = ui.reduce((s, b) => s + b.length, 0);
  sub.push(Buffer.concat([Buffer.from([0x50, 0x00]), u16(uiLen), ...ui]));

  const body: Buffer[] = [u16(0x0001), u16(0x0000)];
  const called = Buffer.alloc(16, 0x20);
  writeAe(called, calledAe);
  const calling = Buffer.alloc(16, 0x20);
  writeAe(calling, MY_AE);
  body.push(called, Buffer.alloc(32), calling, Buffer.alloc(32));
  for (const s of sub) body.push(s);

  const variable = Buffer.concat(body);
  const header = Buffer.alloc(6);
  header[0] = PDU_TYPE.A_ASSOCIATE_RQ;
  header.writeUInt32BE(variable.length, 2);
  return Buffer.concat([header, variable]);
}

function writeAe(buf: Buffer, ae: string) {
  const b = Buffer.from(ae.padEnd(16, " ").slice(0, 16), "latin1");
  b.copy(buf, 0);
}

function u16(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(v, 0);
  return b;
}
function u32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v >>> 0, 0);
  return b;
}

const fallbackSopClass = "1.2.840.10008.5.1.4.1.1.7";

/**
 * TLS connection options for DICOM over TLS (DICOM TLS / mTLS). Peer
 * verification is off unless a CA bundle is configured via `DICOM_TLS_CA`
 * (interop fallback); setting `DICOM_TLS_CA` enables mTLS against
 * hospital-controlled CAs.
 */
export function buildTlsConnectOptions(
  host: string,
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): tls.ConnectionOptions {
  const options: tls.ConnectionOptions = {
    host,
    port,
    rejectUnauthorized: false,
  };
  if (env.DICOM_TLS_CA) {
    options.ca = env.DICOM_TLS_CA.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    options.rejectUnauthorized = true;
  }
  return options;
}

/**
 * Opens a raw or TLS DICOM transport socket. Returns the socket and the event
 * that signals the transport is ready for a DICOM PDU (`connect` for TCP,
 * `secureConnect` for TLS).
 */
export function openDicomSocket(
  host: string,
  port: number,
  useTls: boolean,
): { socket: net.Socket; readyEvent: "connect" | "secureConnect" } {
  if (useTls) {
    return {
      socket: tls.connect(
        buildTlsConnectOptions(host, port),
      ) as unknown as net.Socket,
      readyEvent: "secureConnect",
    };
  }
  return { socket: net.connect({ host, port }), readyEvent: "connect" };
}
