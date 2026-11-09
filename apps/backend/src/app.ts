import express, { Request, Response, NextFunction } from "express";
import { authSession, initializePassport, restoreUser } from "./auth";
import { apiRouter } from "./routes";
import { lti13Router } from "./lti/provider";
import { trustProxyHops } from "./auth/sessions";

export const app = express();
// Only enable when the last trusted proxy overwrites forwarded headers.
app.set("trust proxy", trustProxyHops);

// Express and core library setup
// Book configs can be several MB when pasted/uploaded in full.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(authSession);
app.use(initializePassport);
app.use(restoreUser);

// API routes
app.use("/api", apiRouter);

// LTI 1.3 (ltijs): /lti13/login_initiations, /lti13/launches, /lti13/keys, /api/lti/session
app.use(lti13Router);


// Basic universal error handler middleware

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // Do not log request/parser errors: they may contain submitted credentials.
  const status = "status" in err && typeof err.status === "number" ? err.status : 500;
  res.status(status).json({
    error: status === 400 ? "Invalid request body." : "Internal Server Error",
  });
});
