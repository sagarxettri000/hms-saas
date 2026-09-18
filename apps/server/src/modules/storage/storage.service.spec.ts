import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LocalStorageDriver } from "./local-storage.driver";
import { StorageService } from "./storage.service";
import { S3StorageDriver } from "./s3-storage.driver";

function makeConfig(overrides: Record<string, string>) {
  return new ConfigService({
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_DIR: path.join(os.tmpdir(), `hms-storage-test-${Date.now()}`),
    ...overrides,
  });
}

describe("LocalStorageDriver", () => {
  const config = makeConfig({});
  const driver = new LocalStorageDriver(config);

  it("puts and reads a file back with correct mime", async () => {
    const result = await driver.put(
      "a/b/test.pdf",
      Buffer.from("%PDF-test"),
      "application/pdf",
    );
    expect(result.size).toBe(9);
    expect(result.url).toContain("/api/v1/storage/file/a/b/test.pdf");
    const got = await driver.get("a/b/test.pdf");
    expect(got).not.toBeNull();
    expect(got!.data.toString()).toBe("%PDF-test");
    expect(got!.contentType).toBe("application/pdf");
  });

  it("returns null for a missing file", async () => {
    const got = await driver.get("nope.txt");
    expect(got).toBeNull();
  });

  it("deletes a file", async () => {
    await driver.put("del.txt", Buffer.from("x"), "text/plain");
    await driver.delete("del.txt");
    expect(await driver.get("del.txt")).toBeNull();
  });

  it("rejects traversal keys", async () => {
    await expect(
      driver.put("../escape.txt", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow();
  });

  afterAll(() => {
    fs.rmSync(config.get<string>("STORAGE_LOCAL_DIR")!, {
      recursive: true,
      force: true,
    });
  });
});

describe("StorageService", () => {
  it("resolves to the local driver by default", async () => {
    const config = makeConfig({});
    const service = new StorageService(config);
    const result = await service.put(
      "f.txt",
      Buffer.from("hello"),
      "text/plain",
    );
    expect(result.key).toBe("f.txt");
    const got = await service.get("f.txt");
    expect(got!.data.toString()).toBe("hello");
    fs.rmSync(config.get<string>("STORAGE_LOCAL_DIR")!, {
      recursive: true,
      force: true,
    });
  });

  it("throws NotFoundException for missing files", async () => {
    const service = new StorageService(makeConfig({}));
    await expect(service.get("missing.txt")).rejects.toThrow(NotFoundException);
  });
});

describe("S3StorageDriver", () => {
  const driver = new S3StorageDriver(
    makeConfig({
      STORAGE_DRIVER: "s3",
      STORAGE_BUCKET: "hms-saas-test",
      STORAGE_REGION: "us-east-1",
      STORAGE_ACCESS_KEY_ID: "AKIA_TEST",
      STORAGE_SECRET_ACCESS_KEY: "secret",
    }),
  );

  it("produces a presigned GET url with expected query params", () => {
    const url = driver.url("uploads/x.pdf");
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Expires=3600");
    expect(url).toContain("AKIA_TEST");
  });

  it("url-encodes keys with slashes for presigned urls", () => {
    const url = driver.url("uploads/deep/x 1.pdf");
    expect(url).toContain("uploads/deep/x%201.pdf");
  });
});
