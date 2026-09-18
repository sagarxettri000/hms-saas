import { Injectable, Logger, Optional } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import {
  ATNA_CODES,
  buildAtnaXml,
  AtnaEntry,
} from "../../../common/audit/atna";

export type AtnaOutcome = "0" | "4" | "12";
export type AtnaAction = "C" | "R" | "U" | "D" | "E";

/**
 * Emits ATNA/RFC 3881 security-audit events for DICOM and integration
 * activity. Persists the XML fragment into the audit log metadata so a
 * dedicated ATNA repository can collect it, and fails silently (non-blocking).
 */
@Injectable()
export class AtnaAuditService {
  private readonly logger = new Logger(AtnaAuditService.name);

  constructor(@Optional() private readonly audit?: AuditService) {}

  /** Fire-and-forget ATNA event emission. */
  emit(
    tenantId: string,
    userId: string | undefined,
    entry: AtnaEntry,
    entity: string,
    entityId?: string,
  ): void {
    void this.write(tenantId, userId, entry, entity, entityId);
  }

  private async write(
    tenantId: string,
    userId: string | undefined,
    entry: AtnaEntry,
    entity: string,
    entityId?: string,
  ): Promise<void> {
    try {
      const xml = buildAtnaXml(entry);
      if (this.audit) {
        await this.audit.log(tenantId, userId, entity, entityId, entry.action, {
          atna: {
            xml,
            eventId: entry.eventIdCode,
            eventLabel: entry.eventIdLabel,
          },
        });
        return;
      }
      // Persistence layer absent (unit tests / minimal deployments): still emit.
      this.logger.debug(
        `ATNA ${entry.eventIdLabel}: ${entity}/${entityId} -> ${entry.objects
          .map((o) => o.id)
          .join(", ")}`,
      );
    } catch (err) {
      this.logger.warn(`Failed to write ATNA audit: ${(err as Error).message}`);
    }
  }

  /** DICOM import / STOW-RS ingest. */
  recordImport(
    tenantId: string,
    userId: string,
    studyIds: string[],
    details?: { patientName?: string; accession?: string; count?: number },
  ): void {
    for (const studyId of studyIds) {
      this.emit(
        tenantId,
        userId,
        this.base(tenantId, userId, {
          outcome: "0",
          action: "C",
          eventIdCode: ATNA_CODES.EVENT_IMPORT,
          eventIdLabel: "Import",
          objects: [
            {
              id: studyId,
              role: ATNA_CODES.ROLE_STUDY,
              roleLabel: "Study",
              description: this.describe(details),
            },
          ],
        }),
        "DICOM_STUDY",
        studyId,
      );
    }
  }

  recordImportFailure(tenantId: string, userId: string, error: string): void {
    this.emit(
      tenantId,
      userId,
      this.base(tenantId, userId, {
        outcome: "12",
        action: "C",
        eventIdCode: ATNA_CODES.EVENT_IMPORT,
        eventIdLabel: "Import",
        objects: [
          {
            id: "N/A",
            role: ATNA_CODES.ROLE_STUDY,
            roleLabel: "Study",
            description: error.slice(0, 1000),
          },
        ],
      }),
      "DICOM_STUDY",
    );
  }

  /** Read access to a DICOM object (WADO/QIDO/MWL). */
  recordAccess(
    tenantId: string,
    userId: string,
    objectId: string,
    label = "DICOM object accessed",
    extraObjects: AtnaEntry["objects"] = [],
  ): void {
    this.emit(
      tenantId,
      userId,
      this.base(tenantId, userId, {
        outcome: "0",
        action: "R",
        eventIdCode: ATNA_CODES.EVENT_ACCESS,
        eventIdLabel: "DICOM Instances Accessed",
        objects: [
          {
            id: objectId,
            role: ATNA_CODES.ROLE_STUDY,
            roleLabel: "Study",
            description: label,
          },
          ...extraObjects,
        ],
      }),
      "DICOM_STUDY",
      objectId,
    );
  }

  /** C-STORE export to an external AE node. */
  recordExport(
    tenantId: string,
    userId: string,
    nodeName: string,
    objects: AtnaEntry["objects"],
  ): void {
    this.emit(
      tenantId,
      userId,
      this.base(tenantId, userId, {
        outcome: "0",
        action: "E",
        eventIdCode: ATNA_CODES.EVENT_EXPORT,
        eventIdLabel: "Export",
        eventTypeCode: ATNA_CODES.EVENT_EXPORT,
        eventTypeLabel: "DICOM instances exported to an AE node",
        participant: {
          name: nodeName,
          role: ATNA_CODES.ROLE_DESTINATION,
          roleLabel: "Destination",
        },
        objects,
      }),
      "DICOM_NODE",
      nodeName,
    );
  }

  /** Node authentication result (C-ECHO). */
  recordNodeAuth(
    tenantId: string,
    userId: string,
    nodeName: string,
    connected: boolean,
  ): void {
    this.emit(
      tenantId,
      userId,
      this.base(tenantId, userId, {
        outcome: connected ? "0" : "12",
        action: "E",
        eventIdCode: ATNA_CODES.EVENT_NODE_AUTH,
        eventIdLabel: "Node Authentication",
        participant: {
          name: nodeName,
          role: ATNA_CODES.ROLE_RESOURCE,
          roleLabel: "Resource",
        },
        objects: [],
      }),
      "DICOM_NODE",
      nodeName,
    );
  }

  /** Application start / stop (listener lifecycle). */
  recordAppLifecycle(
    tenantId: string,
    userId: string,
    nodeName: string,
    starting: boolean,
  ): void {
    this.emit(
      tenantId,
      userId,
      this.base(tenantId, userId, {
        outcome: "0",
        action: starting ? "C" : "D",
        eventIdCode: starting
          ? ATNA_CODES.EVENT_APP_START
          : ATNA_CODES.EVENT_APP_STOP,
        eventIdLabel: starting ? "Application Start" : "Application Stop",
        eventTypeLabel: "DICOM SCP listener",
        participant: {
          name: nodeName,
          role: ATNA_CODES.ROLE_RESOURCE,
          roleLabel: "Resource",
        },
        objects: [],
      }),
      "DICOM_LISTENER",
      nodeName,
    );
  }

  private base(
    tenantId: string,
    userId: string,
    rest: Omit<AtnaEntry, "initiator">,
  ): AtnaEntry {
    return {
      initiator: {
        userId: userId ?? "UnknownUser",
        name: userId ?? "Unknown User",
        role: ATNA_CODES.ROLE_PERSON,
        roleLabel: "User",
      },
      ...rest,
    };
  }

  private describe(details?: {
    patientName?: string;
    accession?: string;
    count?: number;
  }): string {
    if (!details) return "DICOM study imported";
    return [
      details.patientName ? `patient=${details.patientName}` : "",
      details.accession ? `accession=${details.accession}` : "",
      details.count !== undefined ? `instances=${details.count}` : "",
    ]
      .filter(Boolean)
      .join(", ");
  }
}
