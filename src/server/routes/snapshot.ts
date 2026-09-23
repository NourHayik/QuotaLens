import type { FastifyInstance } from "fastify";
import type { RefreshService } from "../../core/application/index.js";
import type { EventBroadcaster } from "../events.js";
import { snapshotQuerySchema } from "../schemas.js";

export interface SnapshotRouteOptions {
  refreshService: RefreshService;
  broadcaster: EventBroadcaster;
  shutdownSignal?: AbortSignal;
}

export async function registerSnapshotRoutes(
  server: FastifyInstance,
  options: SnapshotRouteOptions,
): Promise<void> {
  server.get("/api/snapshot", async (request, reply) => {
    const query = snapshotQuerySchema.parse(request.query);

    if (query.fresh) {
      const snapshot = await options.refreshService.refreshAll({
        force: true,
        ...(query.providerId ? { providerIds: [query.providerId] } : {}),
        ...(options.shutdownSignal ? { signal: options.shutdownSignal } : {}),
      });

      options.broadcaster.broadcastSnapshotUpdated(snapshot);
      return reply.code(200).send(snapshot);
    }

    const cached = options.refreshService.getCachedAggregateSnapshot({
      ...(query.providerId ? { providerIds: [query.providerId] } : {}),
    });

    return reply.code(200).send(cached);
  });
}
