const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Keep the exact production frontend allowed if Render's environment
// variable is missing or still contains an old Vercel deployment URL.
const productionOrigins = ["https://academic-tracker-nu.vercel.app"];
const configuredOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://127.0.0.1:5500")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...productionOrigins, ...configuredOrigins])];

// Allow preview deployments for this Vercel project only. Do not use a broad
// *.vercel.app rule: that would let unrelated sites call the API from browsers.
const previewOriginPattern = /^https:\/\/academic-tracker-git-[a-z0-9-]+-michael-aals-projects\.vercel\.app$/;
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
