"use strict";

console.log("[startup] Academic Tracker API booting.", {
  node: process.version,
  environment: process.env.NODE_ENV || "development"
});

try {
  console.log("[startup] Loading environment configuration...");
  const { validateEnvironment } = require("./config");
  validateEnvironment();
  console.log("[startup] Required environment variables are present.");

  console.log("[startup] Loading Express application and route modules...");
  const { app, closeDatabase } = require("./app");
  console.log("[startup] Express application loaded.");

  const port = Number(process.env.PORT) || 4000;
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Academic Tracker API listening on port ${port}`);
  });

  server.on("error", (error) => {
    console.error("[startup] HTTP listener failed:", {
      code: error.code || "UNKNOWN",
      message: error.message
    });
    process.exitCode = 1;
  });

  async function shutdown(signal) {
    console.log(`${signal} received; shutting down gracefully.`);
    server.close(async () => {
      try {
        await closeDatabase();
        process.exit(0);
      } catch (error) {
        console.error("Shutdown error:", error);
        process.exit(1);
      }
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  console.error("[startup] API failed before the HTTP listener started:", {
    name: error?.name || "Error",
    message: error?.message || "Unknown startup error",
    code: error?.code || null,
    stack: error?.stack || null
  });
  process.exitCode = 1;
}
