import { openDicomSocket, buildTlsConnectOptions } from "./dicom-scu.service";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { loadScpTlsOptions } from "./dicom-scp.service";

function tmpFile(prefix: string): string {
  const p = path.join(
    os.tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.pem`,
  );
  fs.writeFileSync(p, `${prefix} content\n`);
  return p;
}

describe("DICOM transport security", () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("uses plain TCP by default and reports the connect event", (done) => {
    const { socket, readyEvent } = openDicomSocket("127.0.0.1", 104, false);
    socket.on("error", () => undefined);
    expect(readyEvent).toBe("connect");
    expect(socket.destroyed).toBe(false);
    socket.destroy();
    done();
  });

  it("uses TLS when the node has TLS enabled and reports secureConnect", (done) => {
    const { socket, readyEvent } = openDicomSocket("127.0.0.1", 2762, true);
    socket.on("error", () => undefined);
    expect(readyEvent).toBe("secureConnect");
    socket.destroy();
    done();
  });

  it("disables peer verification by default (interop fallback)", () => {
    const opts = buildTlsConnectOptions("pacs", 1110, {});
    expect(opts).toEqual({
      host: "pacs",
      port: 1110,
      rejectUnauthorized: false,
    });
  });

  it("enables mTLS verification when DICOM_TLS_CA is set", () => {
    const opts = buildTlsConnectOptions("pacs", 1110, {
      DICOM_TLS_CA: "ca-a.pem, ca-b.pem",
    });
    expect(opts.rejectUnauthorized).toBe(true);
    expect(opts.ca).toEqual(["ca-a.pem", "ca-b.pem"]);
  });

  it("builds TLS server options from configured PEM paths", () => {
    const cert = tmpFile("dcm-cert");
    const key = tmpFile("dcm-key");
    const ca = tmpFile("dcm-ca");
    try {
      const opts = loadScpTlsOptions({
        DICOM_TLS_CERT: cert,
        DICOM_TLS_KEY: key,
        DICOM_TLS_CA: ca,
      });
      expect(String(opts.cert)).toContain("dcm-cert content");
      expect(String(opts.key)).toContain("dcm-key content");
      expect(Array.isArray(opts.ca)).toBe(true);
      expect(String((opts.ca as Buffer[])[0])).toContain("dcm-ca content");
      expect(opts.requestCert).toBe(true);
      expect(opts.rejectUnauthorized).toBe(true);
    } finally {
      for (const f of [cert, key, ca]) fs.unlinkSync(f);
    }
  });

  it("rejects TLS listeners without configured credentials", () => {
    expect(() => loadScpTlsOptions({})).toThrow(
      /DICOM_TLS_CERT\/DICOM_TLS_KEY/,
    );
  });
});
