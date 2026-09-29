import {
  Body,
  Controller,
  Get,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type {
  MaitriChatRequest,
  MaitriConfirmRequest,
  MaitriStreamEvent,
} from "@hms/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { MaitriOrchestratorService, type MaitriActor } from "./maitri-orchestrator.service";

/**
 * Maitri Assistant endpoints. Every route sits behind the same guard chain as
 * the rest of the HMS (JWT, permissions, tenant) — the assistant never bypasses
 * platform security (spec 8). The chat route streams orchestration events over
 * SSE (spec 21) using a raw express response (same pattern as the HMS PDF
 * endpoints) so the global response interceptor does not buffer it; a plain
 * JSON fallback is provided for non-streaming clients.
 */
@ApiTags("Maitri Assistant")
@Controller("ai")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@ApiBearerAuth()
export class MaitriController {
  constructor(private readonly orchestrator: MaitriOrchestratorService) {}

  private actorFrom(req: any): MaitriActor {
    return {
      id: req.user.id,
      tenantId: req.user.tenantId,
      role: req.user.role,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
    };
  }

  /** Tool registry metadata — lets the client render role-aware quick actions. */
  @Get("tools")
  @ApiOperation({ summary: "List Maitri assistant tools for the current role" })
  listTools(@Req() req: any) {
    return {
      role: req.user.role,
      tools: this.orchestrator.listToolSpecs(),
    };
  }

  /** Chat turn as an incremental SSE stream of MaitriStreamEvent frames. */
  @Post("chat")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Send a message to Maitri Assistant (SSE stream)" })
  async chatSse(
    @Req() req: any,
    @Res() res: Response,
    @Body() body: MaitriChatRequest,
  ) {
    if (String(body?.message ?? "").length > 4000) {
      res.status(413).json({
        statusCode: 413,
        message: "Message too long for the assistant.",
      });
      return;
    }
    const actor = this.actorFrom(req);
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (event: MaitriStreamEvent) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    req.on?.("close", () => {
      try {
        res.end();
      } catch {
        /* already closed */
      }
    });

    try {
      for await (const ev of this.orchestrator.chatTurn(
        actor,
        body ?? { message: "" },
      )) {
        send(ev);
      }
    } catch {
      send({
        type: "error",
        message: "The assistant service returned an error.",
      });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  /** Non-streaming fallback returning the full event list as JSON. */
  @Post("chat/json")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Send a message to Maitri Assistant (JSON)" })
  async chatJson(
    @Req() req: any,
    @Body() body: MaitriChatRequest,
  ) {
    if (String(body?.message ?? "").length > 4000) {
      throw new PayloadTooLargeException("Message too long for the assistant.");
    }
    const actor = this.actorFrom(req);
    const events: MaitriStreamEvent[] = [];
    for await (const ev of this.orchestrator.chatTurn(
      actor,
      body ?? { message: "" },
    )) {
      events.push(ev);
    }
    return events;
  }

  /** Resolve a pending destructive-action confirmation (spec 14/32). */
  @Post("confirm")
  @ApiOperation({ summary: "Approve or reject a pending assistant action" })
  async confirm(
    @Req() req: any,
    @Body() body: MaitriConfirmRequest,
  ) {
    const actor = this.actorFrom(req);
    const result = await this.orchestrator.resolveConfirmation(
      actor,
      String(body?.toolCallId ?? ""),
      body?.approved === true,
    );
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, reply: result.reply };
  }
}
