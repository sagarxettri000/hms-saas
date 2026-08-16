import { Controller, Query, Sse } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Observable } from "rxjs";
import { NotificationsHub, NotificationEvent } from "./notifications.hub";
import { JwtService } from "@nestjs/jwt";

@ApiTags("Notifications")
@Controller("notifications")
export class NotificationsStreamController {
  constructor(
    private readonly hub: NotificationsHub,
    private readonly jwtService: JwtService,
  ) {}

  @Sse("stream")
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
