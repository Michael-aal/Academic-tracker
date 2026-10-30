const express = require("express");
const rateLimit = require("express-rate-limit");
const { prisma } = require("../prisma");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();
const inquiryLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many institution inquiries. Please try again later." } });

router.post("/", inquiryLimiter, async (req, res, next) => {
  try {
    const institutionName = typeof req.body?.institutionName === "string" ? req.body.institutionName.trim().slice(0, 180) : "";
    const contactName = typeof req.body?.contactName === "string" ? req.body.contactName.trim().slice(0, 120) : "";
    const contactEmail = typeof req.body?.contactEmail === "string" ? req.body.contactEmail.trim().toLowerCase().slice(0, 254) : "";
    const seatCount = req.body?.seatCount === undefined ? 25 : req.body.seatCount;
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 2000) : null;
    if (institutionName.length < 2 || contactName.length < 2) return res.status(400).json({ error: "Enter the institution and contact person's name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return res.status(400).json({ error: "Enter a valid contact email." });
    if (!Number.isInteger(seatCount) || seatCount < 5 || seatCount > 10000) return res.status(400).json({ error: "Seat count must be a whole number from 5 to 10,000." });
    const lead = await prisma.institutionLicense.create({ data: { institutionName, contactName, contactEmail, seatCount, notes: notes || null } });
    return res.status(201).json({ ok: true, inquiryId: lead.id, message: "Your institution inquiry has been received. A team member will review it." });
  } catch (error) { next(error); }
});

router.get("/", requireAdmin, async (_req, res, next) => {
  try {
    const inquiries = await prisma.institutionLicense.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ inquiries });
  } catch (error) { next(error); }
});

module.exports = router;
