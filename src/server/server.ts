import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { CliContext } from "../cli/context.js";
import { redactSecrets } from "../infra/logging/redact.js";
import { processRegistry } from "../infra/process/process-registry.js";
import { EventBroadcaster } from "./events.js";
import { assertLoopbackHost } from "./loopback.js";
import { registerEventsRoutes } from "./routes/events.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerProvidersRoutes } from "./routes/providers.js";
import { registerRefreshRoutes } from "./routes/refresh.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerSnapshotRoutes } from "./routes/snapshot.js";

export interface ServerOptions {
  staticDir?: string;
  corsOrigins?: string[] | boolean;
  broadcaster?: EventBroadcaster;
  heartbeatIntervalMs?: number;
}

export interface StartServerOptions extends ServerOptions {
  host?: string;
  port?: number;
}

export interface RunningServer {
  readonly server: FastifyInstance;
  readonly broadcaster: EventBroadcaster;
  readonly url: string;
  readonly host: string;
  readonly port: number;
  close(): Promise<void>;
}

/**
 * Creates and configures the local Fastify server instance.
 */
export async function createFastifyServer(
  context: CliContext,
  options: ServerOptions = {},
): Promise<{ server: FastifyInstance; broadcaster: EventBroadcaster }> {
  const server = fastify({
    logger: false, // We use the application's redacted structured logger
  });

  const broadcaster =
    options.broadcaster ??
    new EventBroadcaster(
      options.heartbeatIntervalMs !== undefined
        ? { heartbeatIntervalMs: options.heartbeatIntervalMs }
        : {},
    );

  // Clean up broadcaster clients when server closes
  server.addHook("onClose", async () => {
    broadcaster.closeAll();
  });

  // CORS: Allow loopback/local dev origins
  await server.register(fastifyCors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like curl, CLI, local file) or local origins
      if (
        !origin ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin.startsWith("http://[::1]:") ||
        origin === "http://localhost" ||
        origin === "http://127.0.0.1" ||
        origin === "http://ai-limit.local" ||
        origin.startsWith("http://ai-limit.local:") ||
        origin.endsWith(".local") ||
        origin.includes(".local:")
      ) {
        cb(null, true);
        return;
      }
      cb(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  // Global error handler: sanitize errors and format Zod validation failures
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request parameters",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const err = error as { statusCode?: number; message?: string; name?: string };
    const statusCode =
      typeof err.statusCode === "number" && err.statusCode >= 400 ? err.statusCode : 500;
    const message = redactSecrets(err.message || "Internal server error");

    return reply.code(statusCode).send({
      error: err.name || "SERVER_ERROR",
      message,
    });
  });

  // Register API routes
  await registerHealthRoutes(server);
  await registerSnapshotRoutes(server, {
    refreshService: context.refreshService,
    broadcaster,
    shutdownSignal: context.shutdownSignal,
  });
  await registerProvidersRoutes(server, {
    registry: context.registry,
    settingsRepo: context.settingsRepo,
    snapshotRepo: context.snapshotRepo,
    healthRepo: context.healthRepo,
    capabilityRepo: context.capabilityRepo,
    refreshService: context.refreshService,
  });
  await registerRefreshRoutes(server, {
    refreshService: context.refreshService,
    broadcaster,
    shutdownSignal: context.shutdownSignal,
  });
  await registerHistoryRoutes(server, {
    snapshotRepo: context.snapshotRepo,
  });
  await registerSettingsRoutes(server, {
    settingsRepo: context.settingsRepo,
  });
  await registerEventsRoutes(server, {
    broadcaster,
  });

  // Serve static UI assets if available
  const currentDir = resolve(fileURLToPath(import.meta.url), "..");
  const candidateStaticDirs = [
    options.staticDir,
    resolve(currentDir, "../../dist/web"),
    resolve(currentDir, "../../../dist/web"),
    resolve(currentDir, "../web"),
    resolve(currentDir, "../../web"),
  ].filter(Boolean) as string[];

  const candidateStaticDir =
    candidateStaticDirs.find((dir) => existsSync(resolve(dir, "index.html"))) ??
    candidateStaticDirs[0] ??
    "";

  if (existsSync(candidateStaticDir)) {
    await server.register(fastifyStatic, {
      root: candidateStaticDir,
      prefix: "/",
      wildcard: false,
    });

    // SPA fallback: non-API GET requests serve index.html
    server.setNotFoundHandler(async (request, reply) => {
      if (!request.raw.url?.startsWith("/api")) {
        const indexPath = resolve(candidateStaticDir, "index.html");
        if (existsSync(indexPath)) {
          const html = readFileSync(indexPath, "utf8");
          return reply.type("text/html").send(html);
        }
      }
      return reply.code(404).send({
        error: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
      });
    });
  }

  return { server, broadcaster };
}

/**
 * Validates loopback binding and starts the Fastify HTTP server.
 */
export async function startServer(
  context: CliContext,
  options: StartServerOptions = {},
): Promise<RunningServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;

  // Strict loopback security constraint check
  assertLoopbackHost(host);

  const { server, broadcaster } = await createFastifyServer(context, options);

  const address = await server.listen({ host, port });
  let actualPort = Number.parseInt(String(port), 10);
  try {
    const rawAddr = server.server.address();
    if (typeof rawAddr === "object" && rawAddr && "port" in rawAddr) {
      actualPort = rawAddr.port;
    } else if (typeof address === "string") {
      const match = address.match(/:(\d+)$/);
      if (match && match[1]) actualPort = Number.parseInt(match[1], 10);
    }
  } catch {
    // Fallback to configured port
  }
  const url = `http://${host}:${actualPort}`;

  return {
    server,
    broadcaster,
    url,
    host,
    port: actualPort,
    close: async () => {
      if (!context.shutdownController.signal.aborted) {
        context.shutdownController.abort();
      }
      await processRegistry.killAll();
      await server.close();
    },
  };
}
