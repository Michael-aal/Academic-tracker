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
  "study-notes",
  "focus-sessions",
  "preferences",
  "learning-progress"
]);
const MAX_RECORDS = { "secondary-tracker": 1, "video-library": 300, "video-history": 300, "study-sessions": 500, "memory-cards": 500, "memory-stats": 1, "tutor-conversations": 200, "note-summaries": 200, "study-notes": 200, "focus-sessions": 500, "preferences": 1, "learning-progress": 1 };
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
  return typeof value === "string" && value.length > 0 && value.length <= 120 && !/[\u0000-\u001f]/.test(value);
}
function validString(value, max, optional = false) {
  return optional && (value === null || value === undefined) || typeof value === "string" && value.length <= max;
}
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validateData(kind, data, recordId) {
  if (!isObject(data)) return "Saved data must be a JSON object.";
  let bytes;
  try { bytes = Buffer.byteLength(JSON.stringify(data), "utf8"); }
  catch { return "Saved data must be valid JSON."; }
  const maxBytes = kind === "secondary-tracker" ? 80000 : 24000;
  if (bytes > maxBytes) return kind === "secondary-tracker" ? "The academic tracker backup must be 80 KB or smaller." : "Each saved record must be 24 KB or smaller.";

  if (kind === "secondary-tracker") {
    if (recordId !== "main") return "The secondary tracker record ID is invalid.";
    if (!isObject(data.scores) || !isObject(data.targets) || !isObject(data.assessments)) return "The tracker record is incomplete.";
    if (!validString(data.academicYear, 30) || !data.academicYear.trim() || !["Term 1", "Term 2", "Term 3"].includes(data.term)) return "The academic period is invalid.";
    const scoreKeys = Object.keys(data.scores);
    const targetKeys = Object.keys(data.targets);
    const assessmentKeys = Object.keys(data.assessments);
    if (scoreKeys.length > 500 || targetKeys.length > 200 || assessmentKeys.length > 200) return "The tracker contains too many saved entries.";
    for (const [key, scores] of Object.entries(data.scores)) {
      if (!validString(key, 120) || !isObject(scores) || Object.keys(scores).length > 30) return "A saved score record is invalid.";
      for (const score of Object.values(scores)) if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) return "Assessment scores must be numbers between 0 and 100.";
    }
    for (const [key, target] of Object.entries(data.targets)) {
      if (!validString(key, 120) || typeof target !== "number" || !Number.isFinite(target) || target < 0 || target > 100) return "Subject targets must be between 0 and 100.";
    }
    for (const [key, items] of Object.entries(data.assessments)) {
      if (!validString(key, 120) || !Array.isArray(items) || items.length > 20) return "A saved assessment setup is invalid.";
      const ids = new Set();
      for (const item of items) {
        if (!isObject(item) || !validString(item.id, 80) || !item.id || ids.has(item.id) ||
            !validString(item.name, 50) || !item.name.trim() ||
            !["TEST", "ASSIGNMENT", "EXAM"].includes(item.type) ||
            typeof item.max !== "number" || !Number.isFinite(item.max) || item.max <= 0 || item.max > 100) return "A saved assessment item is invalid.";
        ids.add(item.id);
      }
    }
  }

  if (kind === "video-library" || kind === "video-history") {
    if (!/^[A-Za-z0-9_-]{11}$/.test(recordId) || data.id !== recordId ||
        !validString(data.title, 300) || !data.title.trim() ||
        !validString(data.channelTitle, 160, true) ||
        !validString(data.description, 600, true) ||
        !validString(data.thumbnail, 500, true) ||
        (data.thumbnail && !/^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//.test(data.thumbnail))) return "The video record is invalid.";
    if (kind === "video-library" && data.savedAt !== undefined && !Number.isFinite(Number(data.savedAt))) return "The saved video timestamp is invalid.";
    if (kind === "video-history" && (!Number.isFinite(Number(data.watchedAt)) || Number(data.watchedAt) <= 0)) return "The video watch timestamp is invalid.";
  }

  if (kind === "study-sessions") {
    const date = typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && !Number.isNaN(Date.parse(data.date + "T00:00:00Z"));
    const start = typeof data.start === "string" && /^\d{2}:\d{2}$/.test(data.start);
    const end = typeof data.end === "string" && /^\d{2}:\d{2}$/.test(data.end);
    if (!validString(data.title, 120) || !data.title.trim() ||
        !validString(data.subject, 80, true) || !date || !start || !end ||
        Number(data.start.slice(0, 2)) > 23 || Number(data.start.slice(3)) > 59 ||
        Number(data.end.slice(0, 2)) > 23 || Number(data.end.slice(3)) > 59 ||
        data.end <= data.start || !["none", "daily", "weekly"].includes(data.repeat) ||
        (data.remind !== undefined && (!Number.isInteger(data.remind) || data.remind < 0 || data.remind > 1440)) ||
        (data.completed !== undefined && typeof data.completed !== "boolean")) return "The study session is invalid.";
  }

  if (kind === "memory-cards") {
    if (!validString(data.subject, 80) || !data.subject.trim() ||
        !validString(data.topic, 120, true) ||
        !validString(data.question, 700) || !data.question.trim() ||
        !validString(data.answer, 1800) || !data.answer.trim()) return "The memory card is invalid.";
    if (!Number.isFinite(Number(data.dueAt)) || Number(data.dueAt) <= 0 ||
        !Number.isInteger(data.repetitions) || data.repetitions < 0 ||
        (data.intervalDays !== undefined && (!Number.isFinite(Number(data.intervalDays)) || Number(data.intervalDays) < 0)) ||
        (data.lastRating != null && !["again", "hard", "good", "easy"].includes(data.lastRating))) return "The memory card review schedule is invalid.";
  }

  if (kind === "memory-stats") {
    if (recordId !== "summary" || !Number.isInteger(data.reviewed) || !Number.isInteger(data.correct) ||
        data.reviewed < 0 || data.correct < 0 || data.correct > data.reviewed) return "The memory review statistics are invalid.";
  }

  if (kind === "tutor-conversations") {
    if (!Array.isArray(data.messages) || data.messages.length > 40 ||
        !data.messages.every(message => isObject(message) && ["student", "tutor"].includes(message.role) &&
          validString(message.content, 12000) && message.content.trim()) ||
        !validString(data.subject, 100, true) || !validString(data.topic, 160, true)) return "The tutoring conversation is invalid.";
  }

  if (kind === "note-summaries") {
    if (!validString(data.subject, 100) || !data.subject.trim() ||
        !validString(data.topic, 160) || !data.topic.trim() ||
        !validString(data.summary, 12000) || !data.summary.trim()) return "The saved summary is invalid.";
  }

  if (kind === "study-notes") {
    if (!validString(data.title, 120) || !data.title.trim() ||
        !validString(data.content, 12000) || !data.content.trim() ||
        !validString(data.subject, 100, true) ||
        !validString(data.topic, 160, true) ||
        !validString(data.context, 500, true) ||
        (data.updatedAt !== undefined && (typeof data.updatedAt !== "string" || Number.isNaN(Date.parse(data.updatedAt))))) return "The study note is invalid.";
  }

  if (kind === "focus-sessions") {
    if (!validString(data.task, 120) || !data.task.trim() ||
        !["ready", "running", "paused", "completed"].includes(data.status) ||
        (data.durationMinutes !== undefined && ![15, 25, 45, 60].includes(data.durationMinutes)) ||
        (data.durationMs !== undefined && (!Number.isFinite(Number(data.durationMs)) || Number(data.durationMs) <= 0))) return "The focus session is invalid.";
  }

  if (kind === "preferences") {
    if (recordId !== "main" || (data.theme !== undefined && !["light", "dark"].includes(data.theme))) return "The saved preferences are invalid.";
  }
  if (kind === "learning-progress") {
    if (recordId !== "main" || !Number.isSafeInteger(data.totalXp) || data.totalXp < 0 || !Array.isArray(data.events) || data.events.length > 500) return "The learning progress record is invalid.";
    for (const event of data.events) if (!isObject(event) || !validString(event.id, 180) || !event.id || !validString(event.type, 40) || !Number.isInteger(event.xp) || event.xp < 0 || !validString(event.at, 40) || Number.isNaN(Date.parse(event.at))) return "A learning progress event is invalid.";
  }
  return null;
}

router.get("/:kind", async (req, res, next) => {
  if (!validKind(req.params.kind)) return res.status(404).json({ error: "Saved data category not found." });
  try {
    const [records, deleted] = await Promise.all([
      prisma.userDataRecord.findMany({
        where: { userId: req.userId, kind: req.params.kind, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: MAX_RECORDS[req.params.kind] || 100,
        select: { recordId: true, data: true, createdAt: true, updatedAt: true }
      }),
      prisma.userDataRecord.findMany({
        where: { userId: req.userId, kind: req.params.kind, deletedAt: { not: null } },
        select: { recordId: true }
      })
    ]);
    res.set("Cache-Control", "private, no-store");
    res.json({ records, deletedIds: deleted.map(item => item.recordId) });
  } catch (error) { next(error); }
});

router.put("/:kind/bulk", async (req, res, next) => {
  const { kind } = req.params;
  if (!validKind(kind)) return res.status(404).json({ error: "Saved data category not found." });
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) return res.status(400).json({ error: "A batch must contain between 1 and 100 records." });
  const ids = new Set();
  for (const item of records) {
    if (!validRecordId(item?.recordId) || ids.has(item.recordId)) return res.status(400).json({ error: "A batch contains an invalid or duplicate record ID." });
    ids.add(item.recordId);
    const validationError = validateData(kind, item.data, item.recordId);
    if (validationError) return res.status(400).json({ error: validationError });
  }
  try {
    const withinQuota = await prisma.$transaction(async tx => {
      // Serialize quota-changing writes for this account. Without this lock,
      // parallel batches could all observe free capacity and exceed the limit.
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${req.userId} FOR UPDATE`;
      const existing = await tx.userDataRecord.findMany({
        where: { userId: req.userId, kind, recordId: { in: [...ids] }, deletedAt: null },
        select: { recordId: true }
      });
      const existingIds = new Set(existing.map(item => item.recordId));
      const currentCount = await tx.userDataRecord.count({ where: { userId: req.userId, kind, deletedAt: null } });
      if (currentCount + records.filter(item => !existingIds.has(item.recordId)).length > (MAX_RECORDS[kind] || 100)) return false;
      await Promise.all(records.map(item => tx.userDataRecord.upsert({
        where: { userId_kind_recordId: { userId: req.userId, kind, recordId: item.recordId } },
        create: { userId: req.userId, kind, recordId: item.recordId, data: item.data },
        update: { data: item.data, deletedAt: null }
      })));
      return true;
    });
    if (!withinQuota) return res.status(409).json({ error: "This account has reached the saved-record limit for this category." });
    res.set("Cache-Control", "private, no-store");
    res.json({ ok: true, saved: records.length });
  } catch (error) { next(error); }
});

router.delete("/:kind/bulk", async (req, res, next) => {
  const { kind } = req.params;
  if (!validKind(kind)) return res.status(404).json({ error: "Saved data category not found." });
  const recordIds = req.body?.recordIds;
  if (!Array.isArray(recordIds) || recordIds.length < 1 || recordIds.length > 100 || !recordIds.every(validRecordId)) {
    return res.status(400).json({ error: "A delete batch must contain between 1 and 100 valid record IDs." });
  }
  try {
    const result = await prisma.userDataRecord.updateMany({ where: { userId: req.userId, kind, recordId: { in: [...new Set(recordIds)] }, deletedAt: null }, data: { deletedAt: new Date() } });
    res.json({ ok: true, deleted: result.count });
  } catch (error) { next(error); }
});

router.put("/:kind/:recordId", async (req, res, next) => {
  const { kind, recordId } = req.params;
  if (!validKind(kind)) return res.status(404).json({ error: "Saved data category not found." });
  if (!validRecordId(recordId)) return res.status(400).json({ error: "Saved record ID is invalid." });
  const validationError = validateData(kind, req.body?.data, recordId);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const record = await prisma.$transaction(async tx => {
      // Share the same per-account lock as bulk writes so single and batch
      // requests cannot race each other around category quotas.
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${req.userId} FOR UPDATE`;
      const where = { userId_kind_recordId: { userId: req.userId, kind, recordId } };
      const existing = await tx.userDataRecord.findUnique({ where, select: { id: true, deletedAt: true } });
      if (!existing || existing.deletedAt) {
        const count = await tx.userDataRecord.count({ where: { userId: req.userId, kind, deletedAt: null } });
        if (count >= (MAX_RECORDS[kind] || 100)) return null;
      }
      return tx.userDataRecord.upsert({
        where: { userId_kind_recordId: { userId: req.userId, kind, recordId } },
        create: { userId: req.userId, kind, recordId, data: req.body.data },
        update: { data: req.body.data, deletedAt: null },
        select: { recordId: true, data: true, createdAt: true, updatedAt: true }
      });
    });
    if (!record) return res.status(409).json({ error: "This account has reached the saved-record limit for this category. Remove an older item before adding another." });
    res.set("Cache-Control", "private, no-store");
    res.json({ record });
  } catch (error) { next(error); }
});

router.delete("/:kind/:recordId", async (req, res, next) => {
  const { kind, recordId } = req.params;
  if (!validKind(kind)) return res.status(404).json({ error: "Saved data category not found." });
  if (!validRecordId(recordId)) return res.status(400).json({ error: "Saved record ID is invalid." });
  try {
    const result = await prisma.userDataRecord.updateMany({ where: { userId: req.userId, kind, recordId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!result.count) return res.status(404).json({ error: "Saved record not found." });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.validateData = validateData;
router.allowedKinds = ALLOWED_KINDS;
module.exports = router;
