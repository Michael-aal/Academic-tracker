const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://127.0.0.1:5500")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function validateEnvironment() {
  const missing = ["DATABASE_URL", "JWT_SECRET"].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. Add them in backend/.env locally or in your hosting provider's environment settings.`
    );
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long.");
  }
}

module.exports = { allowedOrigins, validateEnvironment };
