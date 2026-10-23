const { prisma } = require("../prisma");

async function requireAdmin(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
    if (!user || user.role !== "ADMIN") return res.status(403).json({ error: "Administrator access is required." });
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireAdmin };
