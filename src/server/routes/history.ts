import type { FastifyInstance } from "fastify";
import type { SnapshotRepository } from "../../infra/storage/index.js";
import { historyQuerySchema, providerIdParamSchema } from "../schemas.js";

export interface HistoryRouteOptions {
  snapshotRepo: SnapshotRepository;
}

export async function registerHistoryRoutes(
  server: FastifyInstance,
  options: HistoryRouteOptions,
): Promise<void> {
  server.get("/api/history/:id", async (request, reply) => {
    const params = providerIdParamSchema.parse(request.params);
    const query = historyQuerySchema.parse(request.query);

    const now = Date.now();
    let durationMs = 24 * 60 * 60 * 1000;
    if (query.range === "7d") {
      durationMs = 7 * 24 * 60 * 60 * 1000;
    } else if (query.range === "30d") {
      durationMs = 30 * 24 * 60 * 60 * 1000;
    }

    const sinceUtc = new Date(now - durationMs).toISOString();
    const history = options.snapshotRepo.getHistory(params.id, {
      sinceUtc,
      limit: query.limit,
    });

    return reply.code(200).send({
      provider_id: params.id,
      range: query.range,
      since: sinceUtc,
      count: history.length,
      history,
    });
  });
}
