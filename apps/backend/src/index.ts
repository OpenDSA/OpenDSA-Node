import express from "express";
import { prisma } from "./db";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "backend" });
});

app.get("/api/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "database" });
  } catch (err) {
    res.status(500).json({ status: "error", service: "database" });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
