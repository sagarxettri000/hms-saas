import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LocalStorageDriver } from "./local-storage.driver";
import { S3StorageDriver, StorageDriver } from "./s3-storage.driver";

@Injectable()
export class StorageService implements StorageDriver {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;

  constructor(config: ConfigService) {
    const driver = (config.get<string>("STORAGE_DRIVER") || "local").toLowerCase();
    if (driver === "s3") {
      this.logger.log("Using S3 storage driver");
      this.driver = new S3StorageDriver(config);
    } else {
      this.logger.log("Using local storage driver");
      this.driver = new LocalStorageDriver(config);
    }
  }

  put(key: string, data: Buffer, contentType: string) {
    return this.driver.put(key, data, contentType);
  }

  async get(key: string) {
    const result = await this.driver.get(key);
    if (!result) throw new NotFoundException("File not found");
    return result;
  }

  delete(key: string) {
    return this.driver.delete(key);
  }

  url(key: string) {
    return this.driver.url(key);
  }
}
