import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { InjectQueue } from "@nestjs/bullmq";
import { Hl7Service } from "./hl7.service";
import { Hl7ProcessResult, Hl7ProcessOptions } from "./hl7.types";
import { parseHl7Message } from "./hl7.parser";

export interface Hl7IngestJobData {
  raw: string;
  options: Hl7ProcessOptions;
  attempt: number;
  source: "http" | "mllp";
  messageControlId: string;
}

export interface Hl7JobResult {
  accepted: boolean;
  result: Hl7ProcessResult;
  messageControlId: string;
}

@Injectable()
export class Hl7QueueService implements OnModuleInit {
  private readonly logger = new Logger(Hl7QueueService.name);
  private readonly maxRetries = 3;
  private workers: Worker[] = [];

  constructor(
    @InjectQueue("hl7-ingest") private readonly ingestQueue: Queue,
    @InjectQueue("hl7-retry") private readonly retryQueue: Queue,
    @InjectQueue("hl7-dead-letter") private readonly deadLetterQueue: Queue,
    private readonly hl7Service: Hl7Service,
  ) {}

  async onModuleInit() {
    if (this.checkRedisAvailability() === false) {
      this.logger.warn(
        "REDIS_HOST not configured - HL7 queue disabled, messages processed synchronously",
      );
      return;
    }
    this.setupWorkers();
    await this.setupQueueEvents();
  }

  private getConnectionOptions() {
    return {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB) || 0,
      maxRetriesPerRequest: 3,
    };
  }

  private setupWorkers() {
    const connection = this.getConnectionOptions();

    const ingestWorker = new Worker(
      "hl7-ingest",
      async (job: Job<Hl7IngestJobData>) => this.processIngestJob(job),
      {
        connection,
        concurrency: 10,
        limiter: { max: 50, duration: 1000 },
      },
    );

    const retryWorker = new Worker(
      "hl7-retry",
      async (job: Job<Hl7IngestJobData>) => this.processRetryJob(job),
      {
        connection,
        concurrency: 5,
        limiter: { max: 20, duration: 1000 },
      },
    );

    const dlqWorker = new Worker(
      "hl7-dead-letter",
      async (job: Job<Hl7IngestJobData>) => this.processDeadLetterJob(job),
      {
        connection,
        concurrency: 1,
      },
    );

    this.workers = [ingestWorker, retryWorker, dlqWorker];

    ingestWorker.on("failed", (job, err) => this.handleJobFailure(job, err));
    retryWorker.on("failed", (job, err) => this.handleRetryFailure(job, err));
  }

  private async setupQueueEvents() {
    const connection = this.getConnectionOptions();

    const ingestEvents = new QueueEvents("hl7-ingest", { connection });
    const retryEvents = new QueueEvents("hl7-retry", { connection });
    const dlqEvents = new QueueEvents("hl7-dead-letter", { connection });

    ingestEvents.on("completed", ({ jobId, returnvalue }) => {
      this.logger.debug(
        `HL7 ingest job ${jobId} completed: ${JSON.stringify(returnvalue)}`,
      );
    });

    ingestEvents.on("failed", ({ jobId, failedReason }) => {
      this.logger.warn(`HL7 ingest job ${jobId} failed: ${failedReason}`);
    });

    retryEvents.on("completed", ({ jobId }) => {
      this.logger.log(`HL7 retry job ${jobId} re-queued for processing`);
    });

    dlqEvents.on("added", ({ jobId }) => {
      this.logger.error(`HL7 message moved to dead-letter queue: ${jobId}`);
    });
  }

  async enqueueMessage(
    raw: string,
    options: Hl7ProcessOptions,
    source: "http" | "mllp" = "http",
  ): Promise<string> {
    let messageControlId = "";
    try {
      const parsed = parseHl7Message(raw);
      messageControlId = parsed.messageControlId;
    } catch {
      // ignore parse errors
    }

    const jobId = messageControlId
      ? `sync-${messageControlId}`
      : `sync-${Date.now()}`;

    if (this.checkRedisAvailability() === false) {
      await this.processSingleMessage(raw, options, messageControlId, jobId);
      return jobId;
    }

    try {
      const job = await this.ingestQueue.add(
        "process-hl7",
        { raw, options, attempt: 1, source, messageControlId },
        {
          priority: source === "mllp" ? 10 : 5,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      return job.id!;
    } catch (err) {
      this.redisAvailable = false;
      this.logger.warn(
        `Redis unavailable, processing synchronously: ${(err as Error).message}`,
      );
      await this.processSingleMessage(raw, options, messageControlId, jobId);
      return jobId;
    }
  }

  private redisAvailable: boolean | null = null;

  private checkRedisAvailability(): boolean {
    if (this.redisAvailable === null) {
      const hasRedis = process.env.REDIS_HOST && process.env.REDIS_PORT;
      this.redisAvailable = hasRedis ? true : false;
    }
    return this.redisAvailable;
  }

  private async processSingleMessage(
    raw: string,
    options: Hl7ProcessOptions,
    messageControlId: string,
    jobId: string,
  ) {
    try {
      const result = await this.hl7Service.processMessage(raw, options);
      this.logger.log(
        `Synchronous HL7 processing for ${messageControlId || jobId}: ${result.accepted ? "accepted" : "rejected"}`,
      );
    } catch (err) {
      this.logger.error(
        `Synchronous HL7 processing failed for ${messageControlId || jobId}: ${(err as Error).message}`,
      );
    }
  }

  private async processIngestJob(
    job: Job<Hl7IngestJobData>,
  ): Promise<Hl7JobResult> {
    const { raw, options } = job.data;
    const result = await this.hl7Service.processMessage(raw, options);

    if (!result.accepted && result.actions.some((a) => a.type === "ERROR")) {
      throw new Error(
        `HL7 processing failed: ${result.actions.map((a) => a.detail).join(", ")}`,
      );
    }

    return {
      accepted: result.accepted,
      result,
      messageControlId: result.messageControlId,
    };
  }

  private async processRetryJob(
    job: Job<Hl7IngestJobData>,
  ): Promise<Hl7JobResult> {
    const { raw, options, attempt } = job.data;
    const nextAttempt = attempt + 1;

    if (nextAttempt > this.maxRetries) {
      await this.moveToDeadLetter(job.data);
      throw new Error(
        `Max retries (${this.maxRetries}) exceeded, moved to DLQ`,
      );
    }

    await this.ingestQueue.add(
      "process-hl7",
      { ...job.data, attempt: nextAttempt },
      {
        delay: this.calculateBackoff(nextAttempt),
        priority: 1,
      },
    );

    const placeholderResult: Hl7ProcessResult = {
      accepted: false,
      messageType: "",
      eventType: "",
      messageControlId: "",
      version: "",
      actions: [],
    };

    return { accepted: false, result: placeholderResult, messageControlId: "" };
  }

  private async processDeadLetterJob(job: Job<Hl7IngestJobData>) {
    this.logger.error(
      `Dead-letter: ${job.data.messageControlId} (${job.data.source}) after ${job.data.attempt} attempts`,
    );
    return { archived: true };
  }

  private async handleJobFailure(
    job: Job<Hl7IngestJobData> | undefined,
    err: Error,
  ) {
    if (!job) return;

    this.logger.warn(
      `Ingest job ${job.id} failed: ${err.message}, scheduling retry`,
    );

    if (job.attemptsMade < this.maxRetries) {
      await this.retryQueue.add(
        "retry-hl7",
        { ...job.data, attempt: job.attemptsMade + 1 },
        { delay: this.calculateBackoff(job.attemptsMade + 1) },
      );
    } else {
      await this.moveToDeadLetter(job.data);
    }
  }

  private async handleRetryFailure(
    job: Job<Hl7IngestJobData> | undefined,
    err: Error,
  ) {
    if (!job) return;
    this.logger.error(
      `Retry job ${job.id} failed: ${err.message}, moving to DLQ`,
    );
    await this.moveToDeadLetter(job.data);
  }

  private async moveToDeadLetter(data: Hl7IngestJobData) {
    await this.deadLetterQueue.add("archive-hl7", data, {
      removeOnComplete: true,
    });
  }

  private calculateBackoff(attempt: number): number {
    const baseDelay = 5000;
    const maxDelay = 300000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    const jitter = Math.random() * 1000;
    return Math.floor(delay + jitter);
  }

  async getQueueStats() {
    if (this.checkRedisAvailability() === false) {
      return {
        ingest: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        retry: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        deadLetter: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
        },
        mode: "sync" as const,
      };
    }

    try {
      const [ingest, retry, dlq] = await Promise.all([
        this.ingestQueue.getJobCounts(),
        this.retryQueue.getJobCounts(),
        this.deadLetterQueue.getJobCounts(),
      ]);

      return {
        ingest,
        retry,
        deadLetter: dlq,
        mode: "redis" as const,
      };
    } catch (err) {
      this.redisAvailable = false;
      this.logger.warn(
        `Redis unavailable for stats: ${(err as Error).message}`,
      );
      return {
        ingest: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        retry: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        deadLetter: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
        },
        mode: "sync" as const,
      };
    }
  }

  async getJobStatus(jobId: string) {
    if (this.checkRedisAvailability() === false) {
      return {
        queue: "ingest",
        jobId,
        state: "completed",
        mode: "sync" as const,
      };
    }

    try {
      const job = await this.ingestQueue.getJob(jobId);
      if (!job) {
        const retryJob = await this.retryQueue.getJob(jobId);
        if (retryJob)
          return { queue: "retry", jobId, state: await retryJob.getState() };
        const dlqJob = await this.deadLetterQueue.getJob(jobId);
        if (dlqJob)
          return {
            queue: "dead-letter",
            jobId,
            state: await dlqJob.getState(),
          };
        return null;
      }
      return { queue: "ingest", jobId, state: await job.getState() };
    } catch (err) {
      this.redisAvailable = false;
      this.logger.warn(
        `Redis unavailable for job status: ${(err as Error).message}`,
      );
      return {
        queue: "ingest",
        jobId,
        state: "completed",
        mode: "sync" as const,
      };
    }
  }

  async pauseProcessing() {
    if (this.checkRedisAvailability() === false) {
      this.logger.log("HL7 processing pause requested (sync mode, no-op)");
      return;
    }
    await Promise.all([this.ingestQueue.pause(), this.retryQueue.pause()]);
    this.logger.log("HL7 processing paused");
  }

  async resumeProcessing() {
    if (this.checkRedisAvailability() === false) {
      this.logger.log("HL7 processing resume requested (sync mode, no-op)");
      return;
    }
    await Promise.all([this.ingestQueue.resume(), this.retryQueue.resume()]);
    this.logger.log("HL7 processing resumed");
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([
      this.ingestQueue.close(),
      this.retryQueue.close(),
      this.deadLetterQueue.close(),
    ]);
  }
}
