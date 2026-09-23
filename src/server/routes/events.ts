import type { FastifyInstance } from "fastify";
import type { EventBroadcaster } from "../events.js";

export interface EventsRouteOptions {
  broadcaster: EventBroadcaster;
}

export async function registerEventsRoutes(
  server: FastifyInstance,
  options: EventsRouteOptions,
): Promise<void> {
  server.get("/api/events", async (_request, reply) => {
    // Hijack Fastify's response lifecycle to stream SSE
    reply.hijack();
    options.broadcaster.addClient(reply.raw);
  });
}
