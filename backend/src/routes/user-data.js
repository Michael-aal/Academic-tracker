const express = require("express");
const rateLimit = require("express-rate-limit");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const ALLOWED_KINDS = new Set([
  "secondary-tracker",
  "video-library",
  "video-history",
  "study-sessions",
  "memory-cards",
  "memory-stats",
  "tutor-conversations",
  "note-summaries",
  "focus-sessions",
  "preferences"
]);
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: req => req.userId,
  message: { error: "Too many data-sync requests. Please wait a moment and try again." }
});
router.use(limiter);

function validKind(kind) {
  return typeof kind === "string" && ALLOWED_KINDS.has(kind);
}
function validRecordId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 120 && !/[\\u0000-\\u001f]/.test(value);
}
function validString(value, max, optional = false) {
  return optional && (value === null || value === undefined) || typeof value === "string" && value.length <= max;
}
function validateData(kind, data, recordId) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "Saved data must be a JSON object.";
  const bytes = Buffer.byteLength(JSON.stringify(data), "utf8");
  if (bytes > 24000) return "Each saved record must be 24 KB or smaller.";
  if (kind === "secondary-tracker") {
    if (recordId !== "main") return "The secondary tracker record ID is invalid.";
    if (!data.scores || typeof data.scores !== "object" || Array.isArray(data.scores) ||
        !data.targets || typeof data.targets !== "object" || Array.isArray(data.targets) ||
        !data.assessments || typeof data.assessments !== "object" || Array.isArray(data.assessments)) return "The tracker record is incomplete.";
    if (!validString(data.academicYear, 30) || !validString(data.term, 20)) return "The academic period is invalid.";
  }
  if (kind === "video-library" || kind === "video-history") {
    if (!/^[A-Za-z0-9_-]{11}$/.test(recordId) || !validString(data.title, 300) || !validString(data.channelTitle, 160, true) || !validString(data.description, 600, true) || !validString(data.thumbnail, 500, true)) return "The video record is invalid.";
  }
  if (kind === "study-sessions") {
    if (!validString(data.title, 120) || !validString(data.subject, 80, true) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(data.date || "") || !/^\\d{2}:\\d{2}$/.test(data.start || "") || !/^\\d{2}:\\d{2}$/.test(data.end || "") || !["none", "daily", "weekly"].includes(data.repeat)) return "The study session is invalid.";
  }
  if (kind === "memory-cards") {
    if (!validString(data.subject, 80) || !validString(data.topic, 120, true) || !validString(data.question, 700) || !validString(data.answer, 1800)) return "The memory card is invalid.";
    if (!Number.isFinite(Number(data.dueAt)) || !Number.isFinite(Number(data.repetitions)) || Number(data.repetitions) < 0) return "The memory card review schedule is invalid.";
  }
  if (kind === "memory-stats") {
    if (recordId !== "summary" || !Number.isInteger(data.reviewed) || !Number.isInteger(data.correct) || data.reviewed < 0 || data.correct < 0 || data.correct > data.reviewed) return "The memory review statistics are invalid.";
  }
  if (kind === "tutor-conversations") {
    if (!Array.isArray(data.messages) || data.messages.length > 40 || !data.messages.every(m => m && ["student", "tutor"].includes(m.role) && validString(m.content, 12000))) return "The tutoring conversation is invalid.";
  }
  if (kind === "note-summaries") {
    if (!validString(data.subject, 100) || !validString(data.topic, 160) || !validString(data.summary, 12000)) return "The saved summary is invalid.";
  }
  if (kind === "focus-sessions") {
    if (!validString(data.task, 120) || !["ready", "running", "paused", "completed"].includes(data.status)) return "The focus session is invalid.";
  }
  if (kind === "preferences") {
    if (recordId !== "main" || (data.theme !== undefined && !["light", "dark"].includes(data.theme))) return "The saved preferences are invalid.";
  }
  return null;
}

router.get("/:kind", async (req, res, next) => {
  if (!validKind(req.params.kind)) return res.status(404).json({ error: "Saved data category not found." });
  try {
    const records = await prisma.userDataRecord.findMany({
      where: { userId: req.userId, kind: req.params.kind },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: { recordId: true, data: true, createdAt: true, updatedAt: true }
    });
    res.set("Cache-Control", "private, no-store");
    res.json({ records });
  } catch (error) { next(error); }
});

router.put("/:kind/:recordId", async (req, res, next) => {
  const { kind, recordId } = req.params;
  if (!validKind(kind)) return res.status(404).json({ error: "Saved data category not found." });
  if (!validRecordId(recordId)) return res.status(400).json({ error: "Saved record ID is invalid." });
  const validationError = validateData(kind, req.body?.data, recordId);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const record = await prisma.userDataRecord.upsert({
      where: { userId_kind_recordId: { userId: req.userId, kind, recordId } },
      create: { userId: req.userId, kind, recordId, data: req.body.data },
      update: { data: req.body.data },
      select: { recordId: true, data: true, createdAt: true, updatedAt: true }
    });
    res.set("Cache-Control", "private, no-store");
    res.json({ record });
  } catch (error) { next(error); }
});

router.delete("/:kind/:recordId", async (req, res, next) => {
  const { kind, recordId } = req.params;
  if (!validKind(kind)) return res.status(404).json({ error: "Saved data category not found." });
  if (!validRecordId(recordId)) return res.status(400).json({ error: "Saved record ID is invalid." });
  try {
    const result = await prisma.userDataRecord.deleteMany({ where: { userId: req.userId, kind, recordId } });
    if (!result.count) return res.status(404).json({ error: "Saved record not found." });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
