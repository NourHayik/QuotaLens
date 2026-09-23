import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/health", async (_request, reply) => {
    return reply.code(200).send({
      status: "ok",
      loopback_only: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });
}
