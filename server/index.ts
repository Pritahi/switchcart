import "dotenv/config";
import { createServer } from "node:http";
import express, { type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import next from "next";
import { pool } from "../src/db";
import { GET as health } from "../src/app/api/health/route";
import { GET as config } from "../src/app/api/config/route";
import { GET as products } from "../src/app/api/products/route";
import { GET as audit } from "../src/app/api/audit/route";
import { GET as source } from "../src/app/api/source/route";
import { GET as listOrders, POST as createOrder } from "../src/app/api/orders/route";
import { GET as getOrder } from "../src/app/api/orders/[id]/route";
import { POST as authorize } from "../src/app/api/orders/[id]/authorize/route";
import { POST as substitute } from "../src/app/api/orders/[id]/substitute/route";
import { POST as consent } from "../src/app/api/orders/[id]/consent/route";
import { POST as availability } from "../src/app/api/merchant/products/[id]/availability/route";

/**
 * Express 5 HTTP backend. API handlers are framework-independent Web
 * Request/Response functions shared with the Next.js route entrypoints.
 * Next.js serves the lightweight hydrated frontend; Express owns /api/*.
 */
type Route = (request: Request, params: Record<string, string>) => Promise<Response>;
const port = Number(process.env.PORT || 3000);
const dev = process.env.NODE_ENV !== "production";

async function main() {
  const frontend = next({ dev, hostname: "0.0.0.0", port });
  await frontend.prepare();
  const render = frontend.getRequestHandler();
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((_req, res, proceed) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    proceed();
  });

  async function invoke(route: Route, req: ExpressRequest, res: ExpressResponse) {
    try {
      const origin = process.env.APP_ORIGIN || `http://127.0.0.1:${port}`;
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined;
      const request = new Request(new URL(req.originalUrl, origin), {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
      });
      const result = await route(request, req.params as Record<string, string>);
      res.status(result.status);
      result.headers.forEach((value, name) => res.setHeader(name, value));
      res.send(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      console.error("API handler failed:", error instanceof Error ? error.message : "unknown error");
      if (!res.headersSent) res.status(500).json({ error: "Internal server error.", code: "INTERNAL" });
    }
  }

  const get = (pattern: string, route: Route) => app.get(pattern, (req, res) => invoke(route, req, res));
  const post = (pattern: string, route: Route) => app.post(pattern, (req, res) => invoke(route, req, res));
  const simple = (handler: (request: Request) => Promise<Response>): Route => (request) => handler(request);
  const withId = (handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>): Route =>
    (request, params) => handler(request, { params: Promise.resolve({ id: params.id }) });

  get("/api/health", simple(health));
  get("/api/config", simple(config));
  get("/api/products", simple(products));
  get("/api/audit", simple(audit));
  get("/api/source", simple(source));
  get("/api/orders", simple(listOrders));
  post("/api/orders", simple(createOrder));
  get("/api/orders/:id", withId(getOrder));
  post("/api/orders/:id/authorize", withId(authorize));
  post("/api/orders/:id/substitute", withId(substitute));
  post("/api/orders/:id/consent", withId(consent));
  post("/api/merchant/products/:id/availability", withId(availability));
  app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found.", code: "NOT_FOUND" }));
  app.use((req, res) => render(req, res));
  app.use((error: Error & { status?: number }, _req: ExpressRequest, res: ExpressResponse, _next: express.NextFunction) => {
    const status = error.status === 413 ? 413 : error instanceof SyntaxError ? 400 : 500;
    if (!res.headersSent) res.status(status).json({ error: status === 400 ? "Invalid JSON body." : status === 413 ? "Request body too large." : "Internal server error.", code: "BAD_REQUEST" });
  });

  const server = createServer(app);
  server.listen(port, "0.0.0.0", () => console.log(`SwitchCart Express server ready on port ${port}`));
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      void Promise.all([pool.end(), frontend.close()]).finally(() => process.exit(0));
    });
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

main().catch((error: unknown) => {
  console.error("SwitchCart startup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
