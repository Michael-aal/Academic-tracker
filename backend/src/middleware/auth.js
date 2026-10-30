const jwt = require("jsonwebtoken");
const { prisma } = require("../prisma");

async function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Please log in to continue." });

  let payload;
  try {
    payload = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "academic-tracker-api",
      audience: "academic-tracker-client"
    });
  } catch {
    return res.status(401).json({ error: "Your session has expired or is invalid. Please log in again." });
  }
  if (typeof payload.sub !== "string" || !payload.sub || !Number.isInteger(payload.sv)) {
    return res.status(401).json({ error: "Your session is invalid. Please log in again." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { sessionVersion: true } });
    if (!user || user.sessionVersion !== payload.sv) {
      return res.status(401).json({ error: "This session has been signed out. Please log in again." });
    }
    req.userId = payload.sub;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireAuth };
