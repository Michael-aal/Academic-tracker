const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { isAllowedOrigin } = require("./config");
const { prisma } = require("./prisma");
const authRoutes = require("./routes/auth");
const subjectRoutes = require("./routes/subjects");
const scoreRoutes = require("./routes/scores");
const supportRoutes = require("./routes/support");
const adminRoutes = require("./routes/admin");
const aiRoutes = require("./routes/ai");
const videoRoutes = require("./routes/videos");

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error("This website is not allowed to access the Academic Tracker API."));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Bootstrap-Secret"]
}));
app.use(express.json({ limit: "30kb" }));

app.get("/", (_req, res) => res.json({
  name: "Academic Tracker API",
  ok: true,
  health: "/api/health"
}));

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: "academic-tracker-api", database: "connected" });
  } catch {
    res.status(503).json({ ok: false, service: "academic-tracker-api", database: "unavailable" });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again in a few minutes." }
});
const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many messages. Please wait before sending another." }
});
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/scores", scoreRoutes);
app.use("/api/support", messageLimiter, supportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/videos", videoRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found." }));

app.use((error, _req, res, _next) => {
  if (error.message && error.message.startsWith("This website is not allowed")) {
    return res.status(403).json({ error: "This website is not allowed to access the API." });
  }
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  console.error("API error:", error);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

async function closeDatabase() {
  await prisma.$disconnect();
}

module.exports = { app, closeDatabase };
