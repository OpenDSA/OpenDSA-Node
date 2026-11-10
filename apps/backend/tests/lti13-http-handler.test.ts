import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { HttpMethod } from "ltijs";
import {
  RouterHttpHandler,
  type ExpressRouteRequest,
} from "../src/lti/express_http_handler";

test("RouterHttpHandler exposes the original Express request to ltijs handlers", async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { marker: string }).marker = "from-express";
    next();
  });

  const router = express.Router();
  const handler = new RouterHttpHandler(router);
  handler.registerRoute("/test", [HttpMethod.Get], async (request, response) => {
    const expressRequest = (request as ExpressRouteRequest).expressRequest;
    response.json({
      marker: (expressRequest as unknown as { marker: string }).marker,
      path: request.path,
    });
  });
  app.use(router);

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/test`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      marker: "from-express",
      path: "/test",
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
