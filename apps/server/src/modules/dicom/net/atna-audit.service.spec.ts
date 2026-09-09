import { buildAtnaXml, ATNA_CODES, AtnaEntry } from "../../../common/audit/atna";
import { AtnaAuditService } from "./atna-audit.service";

function makeAudit() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
  };
}

const entry: AtnaEntry = {
  outcome: "0",
  action: "C",
  eventIdCode: ATNA_CODES.EVENT_IMPORT,
  eventIdLabel: "Import",
  initiator: { userId: "user-1", name: "Dr. Rai", role: ATNA_CODES.ROLE_PERSON, roleLabel: "User" },
  participant: { name: "HMS", role: ATNA_CODES.ROLE_APPLICATION, roleLabel: "Application" },
  objects: [
    { id: "study-1", role: ATNA_CODES.ROLE_STUDY, roleLabel: "Study", description: "CT Chest, count=12" },
  ],
};

describe("ATNA (RFC 3881) audit", () => {
  it("builds a well-formed AuditMessage XML fragment", () => {
    const xml = buildAtnaXml(entry);
    expect(xml).toContain("<AuditMessage");
    expect(xml).toContain('xmlns="http://dicom.nema.org/');
    expect(xml).toContain('EventActionCode="C"');
    expect(xml).toContain('EventOutcomeIndicator="0"');
    expect(xml).toContain(`<EventID code="${ATNA_CODES.EVENT_IMPORT}"`);
    expect(xml).toContain('<ActiveParticipant UserID="user-1"');
    expect(xml).toContain("<ParticipantObjectIdentification");
    expect(xml).toContain("ParticipantObjectID=\"study-1\"");
    expect(xml).toContain(`code="${ATNA_CODES.ROLE_STUDY}"`);
  });

  it("escapes XML-significant characters in identifiers", () => {
    const evil: AtnaEntry = {
      ...entry,
      initiator: { ...entry.initiator, name: "A <B> & \"C\"" },
      objects: [{ id: "study-<1>", role: "110171", roleLabel: "Study & More" }],
    };
    const xml = buildAtnaXml(evil);
    expect(xml).not.toContain("<B>");
    expect(xml).toContain("&lt;B&gt;");
    expect(xml).toContain("&amp;");
  });

  it("writes the event through the audit log with ATNA metadata", async () => {
    const audit = makeAudit();
    const svc = new AtnaAuditService(audit as any);
    svc.emit("t1", "user-1", entry, "DICOM_STUDY", "study-1");
    await new Promise((r) => setTimeout(r, 10));
    expect(audit.log).toHaveBeenCalledWith(
      "t1",
      "user-1",
      "DICOM_STUDY",
      "study-1",
      "C",
      expect.objectContaining({
        atna: expect.objectContaining({ eventId: ATNA_CODES.EVENT_IMPORT }),
      }),
    );
    const metadata = audit.log.mock.calls[0][5] as any;
    expect(metadata.atna.xml).toContain("<AuditMessage");
  });

  it("does not throw when the audit store is unavailable", async () => {
    const svc = new AtnaAuditService(undefined as any);
    expect(() =>
      svc.recordAccess("t1", "user-1", "study-abc", "view"),
    ).not.toThrow();
  });

  it("emits node authentication outcome", async () => {
    const audit = makeAudit();
    const svc = new AtnaAuditService(audit as any);
    svc.recordNodeAuth("t1", "user-1", "PACS-A", false);
    await new Promise((r) => setTimeout(r, 10));
    const metadata = audit.log.mock.calls[0][5] as any;
    expect(metadata.atna.xml).toContain('EventOutcomeIndicator="12"');
    expect(metadata.atna.xml).toContain(`code="${ATNA_CODES.EVENT_NODE_AUTH}"`);
  });
});