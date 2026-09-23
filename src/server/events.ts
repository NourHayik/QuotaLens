import type { ServerResponse } from "node:http";
import type { AggregateSnapshot, ProviderSnapshot } from "../core/domain/index.js";

export interface SseClient {
  readonly id: string;
  readonly res: ServerResponse;
  readonly connectedAt: Date;
}

export interface EventBroadcasterOptions {
  heartbeatIntervalMs?: number;
}

/**
 * Manages Server-Sent Events (SSE) connections and broadcasts provider updates.
 */
export class EventBroadcaster {
  private readonly clients = new Map<string, SseClient>();
  private readonly heartbeatIntervalMs: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private nextClientId = 1;

  constructor(options: EventBroadcasterOptions = {}) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
  }

  /**
   * Registers a new SSE connection on the raw HTTP response.
   */
  addClient(res: ServerResponse): string {
    const clientId = `client-${this.nextClientId++}`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Flush headers immediately
    res.flushHeaders?.();

    const client: SseClient = {
      id: clientId,
      res,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);

    // Send initial connection acknowledgement
    this.sendRaw(res, "connected", {
      clientId,
      timestamp: new Date().toISOString(),
      activeClients: this.clients.size,
    });

    res.on("close", () => {
      this.removeClient(clientId);
    });

    this.ensureHeartbeat();
    return clientId;
  }

  /**
   * Removes client and stops heartbeat if no clients remain.
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      try {
        if (!client.res.writableEnded) {
          client.res.end();
        }
      } catch {
        // Ignore errors during client disconnect
      }
    }

    if (this.clients.size === 0 && this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Number of currently connected SSE clients.
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcasts a named event with JSON payload to all connected clients.
   */
  broadcast(eventName: string, data: unknown): void {
    if (this.clients.size === 0) return;

    for (const [id, client] of this.clients.entries()) {
      try {
        if (client.res.writableEnded || client.res.destroyed) {
          this.clients.delete(id);
          continue;
        }
        this.sendRaw(client.res, eventName, data);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  /**
   * Broadcasts that a provider refresh has started.
   */
  broadcastProviderRefreshing(providerId: string): void {
    this.broadcast("provider:refreshing", {
      provider_id: providerId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcasts that a single provider snapshot has updated.
   */
  broadcastProviderUpdated(providerId: string, snapshot: ProviderSnapshot): void {
    this.broadcast("provider:updated", {
      provider_id: providerId,
      snapshot,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcasts that a full aggregate snapshot has updated.
   */
  broadcastSnapshotUpdated(snapshot: AggregateSnapshot): void {
    this.broadcast("snapshot:updated", {
      snapshot,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Closes all active client connections and halts heartbeat.
   */
  closeAll(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const [id, client] of this.clients.entries()) {
      try {
        this.sendRaw(client.res, "shutdown", { message: "Server shutting down" });
        client.res.end();
      } catch {
        // Ignore cleanup errors
      }
      this.clients.delete(id);
    }
  }

  private sendRaw(res: ServerResponse, eventName: string, data: unknown): void {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    res.write(`event: ${eventName}\ndata: ${payload}\n\n`);
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer || this.clients.size === 0) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.clients.size === 0) {
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        return;
      }

      for (const [id, client] of this.clients.entries()) {
        try {
          if (client.res.writableEnded || client.res.destroyed) {
            this.clients.delete(id);
            continue;
          }
          client.res.write(": heartbeat\n\n");
        } catch {
          this.clients.delete(id);
        }
      }
    }, this.heartbeatIntervalMs);

    // Unref so heartbeat doesn't prevent Node process exit
    this.heartbeatTimer.unref();
  }
}
