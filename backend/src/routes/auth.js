const express = require("express");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { cleanString, TERMS } = require("../validation");
const router = express.Router();

// Count failed logins rather than successful ones so legitimate users are not
// penalized for signing in. The broader /api/auth limiter remains as a second layer.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many unsuccessful sign-in attempts. Please wait 15 minutes before trying again." }
});
const registrationLimiter = rateLimit({
  windowMs: 60 *  60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many account registrations from this network. Please try again later." }
});

const publicUser = user => ({
  id: user.id, name: user.name, email: user.email, role: user.role,
  isAdmin: ["ADMIN", "DEVELOPER", "DEV"].includes(user.role),
  educationTrack: user.educationTrack || "SECONDARY",
  institutionName: user.institutionName || null,
  programme: user.programme || null,
  studyLevel: user.studyLevel || null,
  currentAcademicYear: user.currentAcademicYear,
  currentTerm: user.currentTerm,
  currentSemester: user.currentSemester || "Semester 1",
  createdAt: user.createdAt
});
function issueToken(userId, sessionVersion = 0) {
  return jwt.sign({ sv: sessionVersion }, process.env.JWT_SECRET, { subject: userId, algorithm: "HS256", issuer: "academic-tracker-api", audience: "academic-tracker-client", expiresIn: "7d" });
}
router.post("/register", registrationLimiter, async (req, res, next) => {
  try {
    const name = cleanString(req.body?.name, 80);
    const email = cleanString(req.body?.email, 254).toLowerCase();
    const password = req.body?.password;
    const educationTrack = req.body?.educationTrack;
    const institutionName = cleanString(req.body?.institutionName, 160);
    const programme = cleanString(req.body?.programme, 160);
    const studyLevel = cleanString(req.body?.studyLevel, 40);
    if (process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL.trim().toLowerCase()) return res.status(403).json({ error: "This email is reserved for the configured administrator. Sign in to its existing account." });
    if (name.length < 2) return res.status(400).json({ error: "Name must be at least 2 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (typeof password !== "string" || password.length < 10 || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ error: "Password must be at least 10 characters and no more than 72 UTF-8 bytes." });
    if (!["SECONDARY", "HIGHER"].includes(educationTrack)) return res.status(400).json({ error: "Choose secondary school or higher institution." });
    if (educationTrack === "HIGHER" && (!institutionName || !programme || !studyLevel)) return res.status(400).json({ error: "Enter your institution, programme, and study level." });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { name, email, passwordHash, role: "USER", educationTrack, institutionName: educationTrack === "HIGHER" ? institutionName : null, programme: educationTrack === "HIGHER" ? programme : null, studyLevel: educationTrack === "HIGHER" ? studyLevel : null } });
    return res.status(201).json({ token: issueToken(user.id, user.sessionVersion), user: publicUser(user) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "An account with that email already exists." });
    next(error);
  }
});
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const email = cleanString(req.body?.email, 254).toLowerCase();
    const password = req.body?.password;
    if (!email || typeof password !== "string" || !password) return res.status(400).json({ error: "Enter your email and password." });
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user && await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Email or password is incorrect." });
    return res.json({ token: issueToken(user.id, user.sessionVersion), user: publicUser(user) });
  } catch (error) { next(error); }
});
router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.userId }, data: { sessionVersion: { increment: 1 } } });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, message: "All active sessions have been signed out." });
  } catch (error) { next(error); }
});
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ error: "Account not found. Please log in again." });
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});
router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const data = {};
    if (req.body?.name !== undefined) {
      const name = cleanString(req.body.name, 80);
      if (name.length < 2) return res.status(400).json({ error: "Name must be at least 2 characters." });
      data.name = name;
    }
    if (req.body?.currentAcademicYear !== undefined) {
      const year = cleanString(req.body.currentAcademicYear, 30);
      if (!year) return res.status(400).json({ error: "Academic year cannot be blank." });
      data.currentAcademicYear = year;
    }
    if (req.body?.currentTerm !== undefined) {
      if (!TERMS.has(req.body.currentTerm)) return res.status(400).json({ error: "Choose Term 1, Term 2, or Term 3." });
      data.currentTerm = req.body.currentTerm;
    }
    if (req.body?.currentSemester !== undefined) {
      if (!["Semester 1", "Semester 2"].includes(req.body.currentSemester)) return res.status(400).json({ error: "Choose Semester 1 or Semester 2." });
      data.currentSemester = req.body.currentSemester;
    }
    for (const field of ["institutionName", "programme", "studyLevel"]) {
      if (req.body?.[field] !== undefined) {
        const value = cleanString(req.body[field], field === "studyLevel" ? 40 : 160);
        if (!value) return res.status(400).json({ error: field + " cannot be blank." });
        data[field] = value;
      }
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: "No valid profile fields were provided." });
    const user = await prisma.user.update({ where: { id: req.userId }, data });
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});
router.post("/admin/bootstrap", requireAuth, async (req, res, next) => {
  try {
    const configuredEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET || "";
    const suppliedSecret = req.get("x-admin-bootstrap-secret") || "";
    if (!configuredEmail || expectedSecret.length < 32) return res.status(503).json({ error: "Administrator bootstrap is not configured on the server." });
    const suppliedBytes = Buffer.from(suppliedSecret);
    const expectedBytes = Buffer.from(expectedSecret);
    if (suppliedBytes.length !== expectedBytes.length || !require("crypto").timingSafeEqual(suppliedBytes, expectedBytes)) return res.status(403).json({ error: "Administrator setup secret is invalid." });
    const account = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!account || account.email.toLowerCase() !== configuredEmail) return res.status(403).json({ error: "Only the signed-in account matching the configured administrator email can be promoted." });
    const user = await prisma.user.update({ where: { id: account.id }, data: { role: "ADMIN" }, select: { id: true, name: true, email: true, role: true } });
    res.json({ ok: true, user: { ...user, isAdmin: true } });
  } catch (error) { next(error); }
});
module.exports = router;
