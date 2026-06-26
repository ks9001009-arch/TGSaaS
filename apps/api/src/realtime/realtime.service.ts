import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface RealtimeEvent {
  data: { type: string; [k: string]: any };
}

/**
 * In-process pub/sub for Server-Sent Events. Keyed by userId so we can push
 * permission changes to a specific admin's open dashboard streams instantly.
 *
 * (Single-instance only. For multi-replica deployments, back this with Redis
 * pub/sub — the public API stays the same.)
 */
@Injectable()
export class RealtimeService {
  private readonly streams = new Map<string, Set<Subject<RealtimeEvent>>>();

  subscribe(userId: string): Observable<RealtimeEvent> {
    const subject = new Subject<RealtimeEvent>();
    let set = this.streams.get(userId);
    if (!set) {
      set = new Set();
      this.streams.set(userId, set);
    }
    set.add(subject);
    return new Observable<RealtimeEvent>((sub) => {
      const s = subject.subscribe(sub);
      return () => {
        s.unsubscribe();
        set!.delete(subject);
        if (set!.size === 0) this.streams.delete(userId);
      };
    });
  }

  emit(userId: string, data: { type: string; [k: string]: any }) {
    const set = this.streams.get(userId);
    if (!set) return;
    for (const subject of set) subject.next({ data });
  }

  // Notify a user their permissions changed (frontend re-fetches + re-renders).
  permissionsChanged(userId: string) {
    this.emit(userId, { type: 'permissions', at: Date.now() });
  }
}
