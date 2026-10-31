const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Keep the exact production frontend allowed if Render's environment
// variable is missing or still contains an old Vercel deployment URL.
const productionOrigins = [
  "https://academic-tracker-nu.vercel.app",
  "https://academic-tracker-iota.vercel.app",
  "https://study-track-lilac.vercel.app"
];
const developmentOrigins = process.env.NODE_ENV === "production" ? "" : "http://localhost:5173,http://127.0.0.1:5500";
const configuredOrigins = (process.env.FRONTEND_ORIGIN || developmentOrigins)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...productionOrigins, ...configuredOrigins])];

// Allow preview deployments for either historical or current Vercel project
// slug, but only under this account's Vercel team hostname. Never use a broad
// *.vercel.app rule: unrelated sites must not be able to call this API.
const previewOriginPattern = /^https:\/\/(?:academic-tracker|study-track)-[a-z0-9-]+-michael-aals-projects\.vercel\.app$/;
function isAllowedOrigin(origin) {
  return allowedOrigins.includes(origin) || previewOriginPattern.test(origin);
}

function validateEnvironment() {
  const missing = ["DATABASE_URL", "JWT_SECRET"].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error("Missing required environment variable(s): " + missing.join(", ") + ". Add them in backend/.env locally or in your hosting provider environment settings.");
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long.");
  }
}

module.exports = { allowedOrigins, isAllowedOrigin, validateEnvironment };
