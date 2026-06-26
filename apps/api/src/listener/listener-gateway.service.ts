import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

// Thin HTTP client to the standalone Python (Telethon) listener service.
// The listener owns the MTProto clients/sessions; NestJS only orchestrates it.
// Auth: a shared secret in the X-Listener-Token header (LISTENER_TOKEN).
@Injectable()
export class ListenerGatewayService {
  private readonly logger = new Logger('ListenerGateway');
  private readonly base = (process.env.LISTENER_URL || 'http://listener:8100').replace(/\/$/, '');
  private readonly token = process.env.LISTENER_TOKEN || '';

  private async call<T = any>(path: string, body?: any): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Listener-Token': this.token,
        },
        body: JSON.stringify(body ?? {}),
        // listener login can take a few seconds (Telegram round-trips)
        signal: AbortSignal.timeout(45000),
      });
    } catch (e: any) {
      this.logger.error(`listener unreachable: ${e?.message}`);
      throw new ServiceUnavailableException('监听服务未就绪，请确认 listener 容器已启动');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const msg = data?.error || data?.message || `监听服务错误 (${res.status})`;
      throw new ServiceUnavailableException(msg);
    }
    return data as T;
  }

  sendCode(accountId: string) {
    return this.call('/login/send-code', { accountId });
  }
  confirmCode(accountId: string, code: string) {
    return this.call('/login/confirm', { accountId, code });
  }
  submitPassword(accountId: string, password: string) {
    return this.call('/login/password', { accountId, password });
  }
  relogin(accountId: string) {
    return this.call('/accounts/relogin', { accountId });
  }
  logout(accountId: string) {
    return this.call('/accounts/logout', { accountId });
  }
  start(accountId: string) {
    return this.call('/accounts/start', { accountId });
  }
  stop(accountId: string) {
    return this.call('/accounts/stop', { accountId });
  }
  status(accountId?: string) {
    return this.call('/status', { accountId });
  }
  syncDialogs(accountId: string) {
    return this.call('/accounts/sync-dialogs', { accountId });
  }
  // Tell the listener to re-read accounts/groups/rules/targets from the DB.
  reload() {
    return this.call('/reload', {}).catch((e) => {
      // reload failures are non-fatal for the API request
      this.logger.warn(`listener reload failed: ${e?.message}`);
      return { ok: false };
    });
  }
}
