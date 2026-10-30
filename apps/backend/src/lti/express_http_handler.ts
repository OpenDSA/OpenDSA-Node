import type { Request, Response, Router } from "express";
import {
  HttpError,
  HttpMethod,
  LtijsError,
  type HttpHandler,
  type HttpResponse,
  type RouteHandler,
} from "ltijs";

class ExpressResponse implements HttpResponse {
  constructor(private readonly res: Response) {}
  status(code: number): HttpResponse {
    this.res.status(code);
    return this;
  }
  redirect(url: string): void {
    this.res.redirect(url);
  }
  html(content: string): void {
    this.res.type("html").send(content);
  }
  json(body: unknown): void {
    this.res.json(body);
  }
}

/**
 * Lets ltijs register its login/launch/keyset routes on an existing Express Router
 * instead of spinning up its own server. Listening/closing is owned by the main app.
 */
export class RouterHttpHandler implements HttpHandler {
  constructor(private readonly router: Router) {}

  registerRoute(path: string, methods: HttpMethod[], handler: RouteHandler): void {
    const wrapped = async (req: Request, res: Response) => {
      const response = new ExpressResponse(res);
      try {
        await handler(
          {
            method: req.method,
            path: req.path,
            query: req.query as Record<string, string | string[]>,
            body: (req.body ?? {}) as Record<string, unknown>,
            headers: req.headers as Record<string, string | string[]>,
          },
          response,
        );
      } catch (error) {
        if (error instanceof LtijsError) {
          console.error(`[ltijs] ${error.name}: ${error.message}`);
          response.status(400).json({ error: error.name, message: error.message });
        } else if (error instanceof HttpError) {
          console.error(`[ltijs] ${error.name}: ${error.message}`);
          response
            .status(error.status ?? 502)
            .json({ error: error.name, message: error.message, external: true });
        } else {
          console.error("[ltijs] Unexpected error", error);
          response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
        }
      }
    };

    for (const method of methods) {
      switch (method) {
        case HttpMethod.Get: this.router.get(path, wrapped); break;
        case HttpMethod.Post: this.router.post(path, wrapped); break;
        case HttpMethod.Put: this.router.put(path, wrapped); break;
        case HttpMethod.Delete: this.router.delete(path, wrapped); break;
        case HttpMethod.All: this.router.all(path, wrapped); break;
      }
    }
  }

  async listen(): Promise<void> {}
  async close(): Promise<void> {}
}
