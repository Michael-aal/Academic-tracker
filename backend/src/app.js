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
const universityRoutes = require("./routes/university");
const userDataRoutes = require("./routes/user-data");
const accountRoutes = require("./routes/account");
const premiumRoutes = require("./routes/premium");
const notificationRoutes = require("./routes/notifications");
const learningRoutes = require("./routes/learning").router;

const app = express();
// The API is hosted behind Render's single reverse-proxy hop. Trust only that
// hop so IP-based rate limits use the originating client address.
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
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
// API responses can contain private academic and account information. Never let
// browsers or intermediary caches reuse them across sessions.
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  next();
});

// A coarse IP-level ceiling protects every API route, including endpoints that
// have their own stricter per-account limits. This in-memory limiter is a
// single-instance safeguard; use a shared store if the API is horizontally scaled.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many API requests. Please wait a few minutes and try again." }
});
app.use("/api", apiLimiter);
// Parse JSON only after the coarse request limiter has run, so oversized or
// malformed request floods do not bypass the first protection layer.
app.use(express.json({ limit: "100kb", verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));

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
app.use("/api/university", universityRoutes);
app.use("/api/user-data", userDataRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/premium", premiumRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/learning", learningRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found." }));

app.use((error, _req, res, _next) => {
  if (error.message && error.message.startsWith("This website is not allowed")) {
    return res.status(403).json({ error: "This website is not allowed to access the API." });
  }
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  // Do not log request bodies, SQL details, provider payloads, or raw error messages.
  console.error("API error:", { name: error?.name || "Error", code: error?.code || error?.type || "INTERNAL_ERROR" });
  res.status(500).json({ error: "An unexpected server error occurred." });
});

async function closeDatabase() {
  await prisma.$disconnect();
}

module.exports = { app, closeDatabase };
