import { app } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const server = app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
  });
});
