import express from "express";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "backend" });
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
