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
  isAdmin: ["ADMIN", "DEVELOPER", "DEV"].includes(String(user.role || "").toUpperCase()),
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
    const configuredAdminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const configuredAdminPassword = process.env.ADMIN_PASSWORD || "";
    const user = await prisma.user.findUnique({ where: { email } });

    // Database password hashes remain the primary credential for every account.
    // For the configured, already-promoted owner account, also accept the
    // server-only ADMIN_PASSWORD as a recovery/operations credential. Crucially,
    // a stale or mismatched ADMIN_PASSWORD must never block the valid account
    // password stored as a bcrypt hash.
    const databasePasswordMatches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    let configuredPasswordMatches = false;
    if (user && configuredAdminEmail && email === configuredAdminEmail &&
        user.role === "ADMIN" && configuredAdminPassword) {
      const supplied = Buffer.from(password, "utf8");
      const expected = Buffer.from(configuredAdminPassword, "utf8");
      configuredPasswordMatches = supplied.length === expected.length &&
        require("node:crypto").timingSafeEqual(supplied, expected);
    }

    if (!databasePasswordMatches && !configuredPasswordMatches) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
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

const crypto = require("node:crypto");
const bootstrapSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "Too many PIN requests. Try again later." }
});
const bootstrapVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "Too many PIN verification attempts. Try again later." }
});
const adminEmailConfigured = () => {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};
const adminSetupConfigured = () => Boolean(adminEmailConfigured() && process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

router.get("/admin/bootstrap-status", async (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    if (!adminSetupConfigured()) return res.json({ available: false });
    const existingAdmin = await prisma.user.findFirst({
      where: { role: { in: ["ADMIN", "DEVELOPER", "DEV"] } }, select: { id: true }
    });
    return res.json({ available: !existingAdmin });
  } catch (error) { next(error); }
});

router.post("/admin/send-pin", bootstrapSendLimiter, async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const configuredEmail = adminEmailConfigured();
    const suppliedEmail = cleanString(req.body?.email, 254).toLowerCase();
    if (!adminSetupConfigured()) return res.status(503).json({ error: "Administrator email delivery is not configured on the API server." });
    if (!suppliedEmail || suppliedEmail !== configuredEmail) return res.status(403).json({ error: "PIN delivery is available only for the configured administrator email." });
    const existingAdmin = await prisma.user.findFirst({
      where: { role: { in: ["ADMIN", "DEVELOPER", "DEV"] } }, select: { id: true }
    });
    if (existingAdmin) return res.status(409).json({ error: "Administrator setup has already been completed. Sign in instead." });

    const now = new Date();
    const existingOtp = await prisma.adminBootstrapOtp.findUnique({ where: { email: configuredEmail } });
    if (existingOtp && now.getTime() - existingOtp.lastSentAt.getTime() < 60_000) {
      return res.status(429).json({ error: "Please wait 60 seconds before requesting another PIN." });
    }
    const sameWindow = existingOtp && now.getTime() - existingOtp.sendWindowStartedAt.getTime() < 60 * 60 * 1000;
    if (sameWindow && existingOtp.sendsInWindow >= 5) return res.status(429).json({ error: "The hourly PIN request limit has been reached. Try again later." });

    const pin = String(crypto.randomInt(100000, 1000000));
    const pinHash = await bcrypt.hash(pin, 10);
    await prisma.adminBootstrapOtp.upsert({
      where: { email: configuredEmail },
      create: {
        email: configuredEmail, pinHash,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        attempts: 0, lastSentAt: now, sendWindowStartedAt: now, sendsInWindow: 1
      },
      update: {
        pinHash, expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        attempts: 0, lastSentAt: now,
        sendWindowStartedAt: sameWindow ? existingOtp.sendWindowStartedAt : now,
        sendsInWindow: sameWindow ? { increment: 1 } : 1
      }
    });

    let mailResponse;
    try {
      mailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [configuredEmail],
          subject: "Your Academic Tracker administrator PIN",
          text: "Your Academic Tracker administrator setup PIN is " + pin + ". It expires in 5 minutes and can be used only once. If you did not request this PIN, ignore this email.",
          html: "<div style=\"font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#201a30\"><h2>Administrator setup</h2><p>Use this one-time PIN to finish setting up Academic Tracker:</p><div style=\"font-size:32px;font-weight:700;letter-spacing:9px;padding:18px;background:#f3efff;border-radius:12px;text-align:center\">" + pin + "</div><p>This PIN expires in <strong>5 minutes</strong> and can be used only once.</p><p>If you did not request it, ignore this email.</p></div>"
        })
      });
    } catch (_error) {
      await prisma.adminBootstrapOtp.deleteMany({ where: { email: configuredEmail, pinHash } });
      return res.status(502).json({ error: "We could not send the PIN email. Please try again later." });
    }
    if (!mailResponse.ok) {
      await prisma.adminBootstrapOtp.deleteMany({ where: { email: configuredEmail, pinHash } });
      return res.status(502).json({ error: "The email provider could not deliver the PIN. Check the server email configuration." });
    }
    return res.json({ ok: true, message: "A one-time PIN has been sent to the configured administrator email. It expires in 5 minutes." });
  } catch (error) { next(error); }
});

router.post("/admin/bootstrap", bootstrapVerifyLimiter, async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const configuredEmail = adminEmailConfigured();
    const email = cleanString(req.body?.email, 254).toLowerCase();
    const name = cleanString(req.body?.name, 80);
    const password = req.body?.password;
    const pin = typeof req.body?.pin === "string" ? req.body.pin.trim() : "";
    if (!adminSetupConfigured()) return res.status(503).json({ error: "Administrator email delivery is not configured on the API server." });
    if (email !== configuredEmail) return res.status(403).json({ error: "Administrator setup is available only for the configured email address." });
    if (name.length < 2) return res.status(400).json({ error: "Enter your name." });
    if (typeof password !== "string" || password.length < 10 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ error: "Password must be at least 10 characters and no more than 72 UTF-8 bytes." });
    }
    if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: "Enter the 6-digit PIN sent to your email." });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT "email" FROM "admin_bootstrap_otps" WHERE "email" = $1 FOR UPDATE', configuredEmail);
      const otp = await tx.adminBootstrapOtp.findUnique({ where: { email: configuredEmail } });
      if (!otp) return { status: "missing" };
      if (otp.expiresAt.getTime() <= Date.now()) {
        await tx.adminBootstrapOtp.delete({ where: { email: configuredEmail } });
        return { status: "expired" };
      }
      if (otp.attempts >= 5) {
        await tx.adminBootstrapOtp.delete({ where: { email: configuredEmail } });
        return { status: "locked" };
      }
      const matches = await bcrypt.compare(pin, otp.pinHash);
      if (!matches) {
        const attempts = otp.attempts + 1;
        if (attempts >= 5) await tx.adminBootstrapOtp.delete({ where: { email: configuredEmail } });
        else await tx.adminBootstrapOtp.update({ where: { email: configuredEmail }, data: { attempts } });
        return { status: attempts >= 5 ? "locked" : "invalid", attemptsRemaining: Math.max(0, 5 - attempts) };
      }
      const existingAdmin = await tx.user.findFirst({
        where: { role: { in: ["ADMIN", "DEVELOPER", "DEV"] } }, select: { id: true }
      });
      if (existingAdmin) {
        await tx.adminBootstrapOtp.delete({ where: { email: configuredEmail } });
        return { status: "already-completed" };
      }
      const existingAccount = await tx.user.findUnique({ where: { email: configuredEmail } });
      const user = existingAccount
        ? await tx.user.update({
            where: { id: existingAccount.id },
            data: { name, passwordHash, role: "ADMIN", sessionVersion: { increment: 1 } }
          })
        : await tx.user.create({ data: { name, email: configuredEmail, passwordHash, role: "ADMIN" } });
      await tx.adminBootstrapOtp.delete({ where: { email: configuredEmail } });
      return { status: "created", user };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.status === "missing") return res.status(400).json({ error: "Request a PIN before completing administrator setup." });
    if (result.status === "expired") return res.status(400).json({ error: "That PIN has expired. Request a new one." });
    if (result.status === "locked") return res.status(429).json({ error: "Too many incorrect PIN attempts. Request a new PIN." });
    if (result.status === "invalid") return res.status(401).json({ error: "That PIN is incorrect. " + result.attemptsRemaining + " attempts remaining." });
    if (result.status === "already-completed") return res.status(409).json({ error: "Administrator setup has already been completed. Sign in instead." });
    return res.status(201).json({
      ok: true, created: true,
      token: issueToken(result.user.id, result.user.sessionVersion),
      user: publicUser(result.user)
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return res.status(409).json({ error: "Administrator setup is being completed by another request. Please try again." });
    }
    next(error);
  }
});

module.exports = router;
