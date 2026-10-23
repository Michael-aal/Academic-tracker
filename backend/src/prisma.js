const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;
const prisma = globalForPrisma.__academicTrackerPrisma || new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__academicTrackerPrisma = prisma;
}

module.exports = { prisma };
