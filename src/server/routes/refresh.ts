import type { FastifyInstance } from "fastify";
import type { RefreshService } from "../../core/application/index.js";
import type { EventBroadcaster } from "../events.js";
import { refreshBodySchema } from "../schemas.js";

export interface RefreshRouteOptions {
  refreshService: RefreshService;
  broadcaster: EventBroadcaster;
  shutdownSignal?: AbortSignal;
}

export async function registerRefreshRoutes(
  server: FastifyInstance,
  options: RefreshRouteOptions,
): Promise<void> {
  server.post("/api/refresh", async (request, reply) => {
    const body = refreshBodySchema.parse(request.body ?? {});

    if (body.providerId) {
      options.broadcaster.broadcastProviderRefreshing(body.providerId);

      const snapshot = await options.refreshService.refreshProvider(body.providerId, {
        force: body.force,
        ...(options.shutdownSignal ? { signal: options.shutdownSignal } : {}),
      });

      options.broadcaster.broadcastProviderUpdated(body.providerId, snapshot);

      return reply.code(200).send({
        refreshed: "single",
        provider_id: body.providerId,
        snapshot,
      });
    }

    const aggregate = await options.refreshService.refreshAll({
      force: body.force,
      ...(options.shutdownSignal ? { signal: options.shutdownSignal } : {}),
    });

    options.broadcaster.broadcastSnapshotUpdated(aggregate);

    return reply.code(200).send({
      refreshed: "all",
      snapshot: aggregate,
    });
  });
}
