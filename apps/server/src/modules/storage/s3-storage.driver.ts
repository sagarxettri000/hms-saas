import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

export interface StorageDriver {
  put(
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<{ key: string; size: number; url: string }>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  url(key: string): string;
}

function hmac(key: Buffer, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function iso8601(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

@Injectable()
export class S3StorageDriver implements StorageDriver {
  private readonly logger = new Logger(S3StorageDriver.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>("STORAGE_BUCKET") || "hms-saas";
    this.region = config.get<string>("STORAGE_REGION") || "us-east-1";
    this.endpoint =
      (config.get<string>("STORAGE_ENDPOINT") || "").replace(/\/$/, "") ||
      `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
    this.accessKeyId = config.get<string>("STORAGE_ACCESS_KEY_ID") || "";
    this.secretAccessKey =
      config.get<string>("STORAGE_SECRET_ACCESS_KEY") || "";
  }

  private sign(
    method: string,
    path: string,
    payloadHash: string,
    date: Date,
    contentType?: string,
  ) {
    const amzDate = iso8601(date);
    const dateStamp = amzDate.slice(0, 8);
    const host = new URL(this.endpoint).host;
    const canonicalUri = path.startsWith("/") ? path : `/${path}`;

    const headers: Record<string, string> = { host };
    const signedHeaders = ["host"];
    if (contentType) {
      headers["content-type"] = contentType;
      signedHeaders.push("content-type");
    }
    headers["x-amz-date"] = amzDate;
    signedHeaders.push("x-amz-date");
    headers["x-amz-content-sha256"] = payloadHash;
    signedHeaders.push("x-amz-content-sha256");

    const canonicalHeaders = signedHeaders
      .sort()
      .map((h) => `${h}:${headers[h]}\n`)
      .join("");

    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders.sort().join(";"),
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const kDate = hmac(
      Buffer.from(`AWS4${this.secretAccessKey}`, "utf8"),
      dateStamp,
    );
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = hmac(kSigning, stringToSign).toString("hex");

    return {
      authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders.sort().join(";")}, Signature=${signature}`,
      amzDate,
      headers,
      payloadHash,
    };
  }

  private encodeKey(key: string): string {
    return key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  async put(key: string, data: Buffer, contentType: string) {
    const path = this.encodeKey(key);
    const payloadHash = crypto.createHash("sha256").update(data).digest("hex");
    const date = new Date();
    const signed = this.sign("PUT", path, payloadHash, date, contentType);

    const res = await fetch(`${this.endpoint}${path}`, {
      method: "PUT",
      headers: {
        ...signed.headers,
        Authorization: signed.authorization,
        "Content-Type": contentType,
      },
      body: data,
    });
    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`S3 PUT failed (${res.status}): ${body}`);
      throw new Error(`Storage put failed: ${res.status}`);
    }
    return { key, size: data.length, url: this.url(key) };
  }

  async get(key: string) {
    const url = this.presignedUrl("GET", key, 60);
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Storage get failed: ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    return {
      data,
      contentType:
        res.headers.get("content-type") || "application/octet-stream",
    };
  }

  async delete(key: string) {
    const path = this.encodeKey(key);
    const date = new Date();
    const signed = this.sign("DELETE", path, sha256Hex(""), date);
    const res = await fetch(`${this.endpoint}${path}`, {
      method: "DELETE",
      headers: {
        ...signed.headers,
        Authorization: signed.authorization,
      },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Storage delete failed: ${res.status}`);
    }
  }

  private presignedUrl(method: string, key: string, expiresSec: number) {
    const path = this.encodeKey(key);
    const payloadHash = "UNSIGNED-PAYLOAD";
    const date = new Date();
    const amzDate = iso8601(date);
    const dateStamp = amzDate.slice(0, 8);
    const host = new URL(this.endpoint).host;
    const headers: Record<string, string> = { host, "x-amz-date": amzDate };
    const signedHeaders = ["host", "x-amz-date"].sort();
    const canonicalHeaders = signedHeaders
      .map((h) => `${h}:${headers[h]}\n`)
      .join("");
    const canonicalRequest = [
      method,
      path,
      `X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${encodeURIComponent(`${this.accessKeyId}/${dateStamp}/${this.region}/s3/aws4_request`)}&X-Amz-Date=${amzDate}&X-Amz-Expires=${expiresSec}&X-Amz-SignedHeaders=${signedHeaders.join(";")}`,
      canonicalHeaders,
      signedHeaders.join(";"),
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    const kDate = hmac(
      Buffer.from(`AWS4${this.secretAccessKey}`, "utf8"),
      dateStamp,
    );
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = hmac(kSigning, stringToSign).toString("hex");

    const query = [
      `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
      `X-Amz-Credential=${encodeURIComponent(`${this.accessKeyId}/${dateStamp}/${this.region}/s3/aws4_request`)}`,
      `X-Amz-Date=${amzDate}`,
      `X-Amz-Expires=${expiresSec}`,
      `X-Amz-SignedHeaders=${signedHeaders.join(";")}`,
      `X-Amz-Signature=${signature}`,
    ].join("&");
    return `${this.endpoint}${path}?${query}`;
  }

  url(key: string): string {
    return this.presignedUrl("GET", key, 3600);
  }
}
