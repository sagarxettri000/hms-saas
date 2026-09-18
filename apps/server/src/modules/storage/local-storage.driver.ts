import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs";
import * as path from "path";
import { StorageDriver } from "./s3-storage.driver";

@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly baseDir: string;
  private readonly prefix: string;

  constructor(config: ConfigService) {
    this.baseDir = path.resolve(
      config.get<string>("STORAGE_LOCAL_DIR") || "./storage",
    );
    this.prefix =
      config.get<string>("STORAGE_URL_PREFIX") || "/api/v1/storage/file";
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private safePath(key: string): string {
    const full = path.resolve(this.baseDir, key);
    if (!full.startsWith(this.baseDir + path.sep) && full !== this.baseDir) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  private ensureDir(key: string) {
    fs.mkdirSync(path.dirname(this.safePath(key)), { recursive: true });
  }

  async put(key: string, data: Buffer, _contentType: string) {
    this.ensureDir(key);
    fs.writeFileSync(this.safePath(key), data);
    return { key, size: data.length, url: this.url(key) };
  }

  async get(key: string) {
    const filePath = this.safePath(key);
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath);
    const contentType = mimeFromExt(path.extname(key));
    return { data, contentType };
  }

  async delete(key: string) {
    const filePath = this.safePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  url(key: string): string {
    return `${this.prefix}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}
