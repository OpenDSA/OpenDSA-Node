import express, { Request, Response, NextFunction } from "express";
import { apiRouter } from "./routes";

export const app = express();

// Express and core library setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", apiRouter);


// Basic universal error handler middleware

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // Do not log request/parser errors: they may contain submitted credentials.
  const status = "status" in err && typeof err.status === "number" ? err.status : 500;
  res.status(status).json({
    error: status === 400 ? "Invalid request body." : "Internal Server Error",
  });
});
