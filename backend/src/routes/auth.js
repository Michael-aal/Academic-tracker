const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { cleanString, TERMS } = require("../validation");

const router = express.Router();
const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isAdmin: user.role === "ADMIN",
  currentAcademicYear: user.currentAcademicYear,
  currentTerm: user.currentTerm,
  createdAt: user.createdAt
});

function issueToken(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: userId,
    algorithm: "HS256",
    issuer: "academic-tracker-api",
    audience: "academic-tracker-client",
    expiresIn: "7d"
  });
}

router.post("/register", async (req, res, next) => {
  try {
    const name = cleanString(req.body?.name, 80);
    const email = cleanString(req.body?.email, 254).toLowerCase();
    const password = req.body?.password;
    if (process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL.trim().toLowerCase()) {
      return res.status(403).json({ error: "This email is reserved for the configured administrator. Sign in to its existing account." });
    }
    if (name.length < 2) return res.status(400).json({ error: "Name must be at least 2 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (typeof password !== "string" || password.length < 10 || password.length > 72) {
      return res.status(400).json({ error: "Password must be between 10 and 72 characters." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { name, email, passwordHash, role: "USER" } });
    return res.status(201).json({ token: issueToken(user.id), user: publicUser(user) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = cleanString(req.body?.email, 254).toLowerCase();
    const password = req.body?.password;
    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Enter your email and password." });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user && await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Email or password is incorrect." });
    return res.json({ token: issueToken(user.id), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, role: true, currentAcademicYear: true, currentTerm: true, createdAt: true }
    });
    if (!user) return res.status(401).json({ error: "Account not found. Please log in again." });
    res.json({ user: { ...user, isAdmin: user.role === "ADMIN" } });
  } catch (error) {
    next(error);
  }
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
    if (!Object.keys(data).length) return res.status(400).json({ error: "No valid profile fields were provided." });
    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: { id: true, name: true, email: true, role: true, currentAcademicYear: true, currentTerm: true, createdAt: true }
    });
    res.json({ user: { ...user, isAdmin: user.role === "ADMIN" } });
  } catch (error) {
    next(error);
  }
});

// One-time, server-configured promotion. ADMIN_EMAIL and ADMIN_BOOTSTRAP_SECRET
// must be set in Render; the request cannot choose or promote an arbitrary email.
router.post("/admin/bootstrap", requireAuth, async (req, res, next) => {
  try {
    const configuredEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET || "";
    const suppliedSecret = req.get("x-admin-bootstrap-secret") || "";
    if (!configuredEmail || expectedSecret.length < 32) {
      return res.status(503).json({ error: "Administrator bootstrap is not configured on the server." });
    }
    if (suppliedSecret.length !== expectedSecret.length ||
        !require("crypto").timingSafeEqual(Buffer.from(suppliedSecret), Buffer.from(expectedSecret))) {
      return res.status(403).json({ error: "Administrator setup secret is invalid." });
    }
    const account = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!account || account.email.toLowerCase() !== configuredEmail) {
      return res.status(403).json({ error: "Only the signed-in account matching the configured administrator email can be promoted." });
    }
    const user = await prisma.user.update({
      where: { id: account.id },
      data: { role: "ADMIN" },
      select: { id: true, name: true, email: true, role: true }
    });
    res.json({ ok: true, user: { ...user, isAdmin: true } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
