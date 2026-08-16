import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";

export interface NotificationEvent {
  tenantId: string;
  userId: string;
  notification: {
    id: string;
    title: string;
    body: string;
    type: string | null;
    channel: string | null;
    referenceType: string | null;
    referenceId: string | null;
    createdAt: Date;
  };
}

@Injectable()
export class NotificationsHub {
  private subjects = new Map<string, Subject<NotificationEvent>>();

  private getSubject(key: string): Subject<NotificationEvent> {
    if (!this.subjects.has(key)) {
      this.subjects.set(key, new Subject<NotificationEvent>());
    }
    return this.subjects.get(key)!;
  }

  subscribe(tenantId: string, userId: string): Observable<NotificationEvent> {
    const key = `${tenantId}:${userId}`;
    return this.getSubject(key).asObservable();
  }

  emit(event: NotificationEvent) {
    const key = `${event.tenantId}:${event.userId}`;
    const subject = this.subjects.get(key);
    if (subject) {
      subject.next(event);
    }
  }

  removeUser(tenantId: string, userId: string) {
    const key = `${tenantId}:${userId}`;
    const subject = this.subjects.get(key);
    if (subject) {
      subject.complete();
      this.subjects.delete(key);
    }
  }
}
