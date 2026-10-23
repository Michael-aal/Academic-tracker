const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "Please log in to continue." });
  }

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "academic-tracker-api",
      audience: "academic-tracker-client"
    });
    if (typeof payload.sub !== "string" || !payload.sub) {
      return res.status(401).json({ error: "Your session is invalid. Please log in again." });
    }
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired or is invalid. Please log in again." });
  }
}

module.exports = { requireAuth };
