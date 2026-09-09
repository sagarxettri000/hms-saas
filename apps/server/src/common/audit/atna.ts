// IHE ATNA / RFC 3881 audit message builder.
// Produces a minimal, well-formed AuditMessage XML fragment for a single
// security-relevant event. Codes follow the ATNA RoleIDCode / EventID tables
// (DICOM 1101xx) and the DICOM event type codes used by IHE ATNA.

export interface AtnaObject {
  /** Identifier of the audited object (study UID, order id, node id, ...). */
  id: string;
  /** ParticipantObjectTypeCodeRole e.g. "110153" (Resource) / "110171" (Study). */
  role: string;
  roleLabel: string;
  description?: string;
}

export interface AtnaEntry {
  /** EventOutcomeIndicator: "0" success, "4" minor failure, "12" major failure. */
  outcome: "0" | "4" | "12";
  /** EventActionCode: C / R / U / D / E. */
  action: "C" | "R" | "U" | "D" | "E";
  eventIdCode: string;
  eventIdLabel: string;
  eventTypeCode?: string;
  eventTypeLabel?: string;
  /** The acting user (always put a Person in this role). */
  initiator: {
    userId: string;
    name?: string;
    networkAddress?: string;
    role: string;
    roleLabel: string;
  };
  /** The actor/resource that processes the event (application or node). */
  participant?: {
    name: string;
    networkAddress?: string;
    role: string;
    roleLabel: string;
  };
  objects: AtnaObject[];
}

export const ATNA_CODES = {
  EVENT_IMPORT: "110107",
  EVENT_EXPORT: "110106",
  EVENT_ACCESS: "110190",
  EVENT_QUERY: "110140",
  EVENT_NODE_AUTH: "110126",
  EVENT_APP_START: "110120",
  EVENT_APP_STOP: "110121",
  EVENT_APP_ACTIVITY: "110100",
  EVENT_ORDER: "110109",
  ROLE_RESOURCE: "110153",
  ROLE_STUDY: "110171",
  ROLE_PATIENT: "110150",
  ROLE_PERSON: "110164",
  ROLE_PROCEDURE: "110170",
  ROLE_DESTINATION: "110152",
  ROLE_APPLICATION: "110151",
} as const;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function attr(k: string, v: string): string {
  return ` ${k}="${esc(v)}"`;
}

function isoNow(): string {
  return new Date().toISOString();
}

/** Build an RFC 3881 AuditMessage XML fragment for a single event. */
export function buildAtnaXml(entry: AtnaEntry): string {
  const parts: string[] = [];

  parts.push(
    `<EventIdentification${attr("EventActionCode", entry.action)}${attr(
      "EventDateTime",
      isoNow(),
    )}${attr("EventOutcomeIndicator", entry.outcome)}>` +
      `<EventID${attr("code", entry.eventIdCode)}${attr("codeSystem", "DCM")}${attr(
        "displayName",
        entry.eventIdLabel,
      )}/>` +
      (entry.eventTypeCode
        ? `<EventTypeCode${attr("code", entry.eventTypeCode)}${attr("codeSystem", "DCM")}${attr(
            "displayName",
            entry.eventTypeLabel || entry.eventIdLabel,
          )}/>`
        : "") +
      `</EventIdentification>`,
  );

  parts.push(
    `<ActiveParticipant${attr("UserID", entry.initiator.userId)}${attr(
      "UserName",
      entry.initiator.name || entry.initiator.userId,
    )}${attr("UserIsRequestor", "true")}${attr(
      "NetworkAccessPointTypeCode",
      entry.initiator.networkAddress ? "2" : "1",
    )}${entry.initiator.networkAddress ? attr("NetworkAccessPointID", entry.initiator.networkAddress) : ""}>` +
      `<RoleIDCode${attr("code", entry.initiator.role)}${attr("codeSystem", "DCM")}${attr(
        "displayName",
        entry.initiator.roleLabel,
      )}/>` +
      `</ActiveParticipant>`,
  );

  parts.push(
    `<ActiveParticipant${attr("UserID", entry.participant?.name || "hms-saas")}${attr(
      "UserIsRequestor",
      "false",
    )}${attr("AlternateUserID", entry.participant ? entry.participant.name : "")}${attr(
      "NetworkAccessPointTypeCode",
      entry.participant?.networkAddress ? "2" : "1",
    )}${entry.participant?.networkAddress ? attr("NetworkAccessPointID", entry.participant.networkAddress) : ""}>` +
      `<RoleIDCode${attr("code", entry.participant?.role || ATNA_CODES.ROLE_APPLICATION)}${attr(
        "codeSystem",
        "DCM",
      )}${attr("displayName", entry.participant?.roleLabel || "Application")}/>` +
      `</ActiveParticipant>`,
  );

  for (const obj of entry.objects) {
    parts.push(
      `<ParticipantObjectIdentification${attr("ParticipantObjectID", obj.id)}${attr(
        "ParticipantObjectTypeCode",
        "2",
      )}${attr("ParticipantObjectTypeCodeRole", obj.role)}>` +
        `<ParticipantObjectTypeCodeRole${attr("code", obj.role)}${attr("codeSystem", "DCM")}${attr(
          "displayName",
          obj.roleLabel,
        )}/>` +
        (obj.description
          ? `<ParticipantObjectDescription>${esc(obj.description)}</ParticipantObjectDescription>`
          : "") +
        `</ParticipantObjectIdentification>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?><AuditMessage xmlns="http://dicom.nema.org/medical/dicom/current/output/html/part15.html#sect_A.5">${parts.join(
    "",
  )}</AuditMessage>`;
}