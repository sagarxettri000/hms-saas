import { Controller, Post, Query, Req, Sse, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Observable } from "rxjs";
import { NotificationsHub, NotificationEvent } from "./notifications.hub";
import { JwtService } from "@nestjs/jwt";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { Public } from "../../common/decorators/permissions.decorator";

@ApiTags("Notifications")
@Controller("notifications")
export class NotificationsStreamController {
  constructor(
    private readonly hub: NotificationsHub,
    private readonly jwtService: JwtService,
  ) {}

  @Post("stream-token")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Issue a short-lived token for the notification stream",
  })
  streamToken(@Req() req: any) {
    const token = this.jwtService.sign(
      {
        tenantId: req.user.tenantId,
        sub: req.user.id,
        aud: "notification-stream",
      },
      { expiresIn: "60s" },
    );
    return { token };
  }

  @Sse("stream")
  @Public()
  @ApiOperation({ summary: "SSE stream for real-time notifications" })
  stream(@Query("token") token: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      if (!token) {
        subscriber.error("Token required");
        return;
      }

      let payload: any;
      try {
        payload = this.jwtService.verify(token);
      } catch {
        subscriber.error("Invalid token");
        return;
      }

      if (payload.aud !== "notification-stream") {
        subscriber.error("Invalid token audience");
        return;
      }

      const tenantId = payload.tenantId;
      const userId = payload.sub || payload.userId;

      if (!tenantId || !userId) {
        subscriber.error("Invalid token payload");
        return;
      }

      const subscription = this.hub.subscribe(tenantId, userId).subscribe({
        next: (event: NotificationEvent) => {
          subscriber.next({
            data: event.notification,
          } as MessageEvent);
        },
        error: (err) => subscriber.error(err),
      });

      return () => {
        subscription.unsubscribe();
      };
    });
  }
}
