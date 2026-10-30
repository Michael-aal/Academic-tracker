const { validateEnvironment } = require("./config");
validateEnvironment();

const { app, closeDatabase } = require("./app");
const { startFocusPushScheduler, stopFocusPushScheduler } = require("./services/focus-push-scheduler");
const port = Number(process.env.PORT) || 4000;
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Academic Tracker API listening on port ${port}`);
  startFocusPushScheduler();
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down gracefully.`);
  stopFocusPushScheduler();
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
