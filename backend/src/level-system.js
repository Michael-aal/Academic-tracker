const LEVEL_STEPS = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];
const LEVEL_NAMES = [
  "Curious Learner", "Explorer", "Apprentice", "Scholar", "Achiever",
  "Specialist", "Expert", "Master", "Grand Scholar", "Academic Legend"
];
const DAILY_XP_CAP = 100;

function levelForXp(totalXp) {
  const xp = Math.max(0, Number(totalXp) || 0);
  let level = 1;
  let startXp = 0;
  let nextXp = LEVEL_STEPS[1];
  while (xp >= nextXp) {
    level += 1;
    startXp = nextXp;
    nextXp = LEVEL_STEPS[level] ?? (nextXp + 300 + (level - 2) * 50);
  }
  return {
    level,
    title: LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)],
    totalXp: xp,
    currentLevelXp: xp - startXp,
    xpForNextLevel: nextXp - startXp,
    xpToNextLevel: Math.max(0, nextXp - xp),
    progressPercent: Math.min(100, Math.round(((xp - startXp) / (nextXp - startXp)) * 100))
  };
}

function dayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function defaultProfile() {
  return { totalXp: 0, dailyXp: 0, dailyXpDate: dayKey(), streakDays: 0, lastActiveDate: null, updatedAt: new Date().toISOString() };
}

async function awardXp(tx, userId, { eventKey, activity, description, points }) {
  if (typeof eventKey !== "string" || !eventKey || eventKey.length > 120) throw new Error("A valid XP event key is required.");
  const safePoints = Math.max(0, Math.min(30, Math.floor(Number(points) || 0)));
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
  const eventWhere = { userId_kind_recordId: { userId, kind: "learning-xp-events", recordId: eventKey } };
  const existing = await tx.userDataRecord.findUnique({ where: eventWhere, select: { data: true } });
  if (existing) return { awarded: 0, duplicate: true };

  const profileWhere = { userId_kind_recordId: { userId, kind: "learning-level", recordId: "main" } };
  const stored = await tx.userDataRecord.findUnique({ where: profileWhere, select: { data: true } });
  const profile = { ...defaultProfile(), ...(stored?.data && typeof stored.data === "object" ? stored.data : {}) };
  const today = dayKey();
  if (profile.dailyXpDate !== today) {
    profile.dailyXp = 0;
    profile.dailyXpDate = today;
  }
  const awarded = Math.min(safePoints, Math.max(0, DAILY_XP_CAP - profile.dailyXp));
  const yesterday = dayKey(Date.now() - 86400000);
  if (profile.lastActiveDate !== today) {
    profile.streakDays = profile.lastActiveDate === yesterday ? Math.max(1, Number(profile.streakDays) || 0) + 1 : 1;
    profile.lastActiveDate = today;
  }
  profile.totalXp = Math.max(0, Number(profile.totalXp) || 0) + awarded;
  profile.dailyXp += awarded;
  profile.updatedAt = new Date().toISOString();

  await tx.userDataRecord.create({
    data: {
      userId, kind: "learning-xp-events", recordId: eventKey,
      data: { activity: String(activity || "learning").slice(0, 40), description: String(description || "Learning activity").slice(0, 160), points: awarded, createdAt: new Date().toISOString() }
    }
  });
  await tx.userDataRecord.upsert({
    where: profileWhere,
    create: { userId, kind: "learning-level", recordId: "main", data: profile },
    update: { data: profile, deletedAt: null }
  });
  return { awarded, duplicate: false, profile: { ...profile, ...levelForXp(profile.totalXp) } };
}

function badgeList(events, profile) {
  const count = activity => events.filter(event => event.data?.activity === activity).length;
  const badges = [
    { id: "first-steps", name: "First Steps", description: "Complete your first learning activity.", earned: events.length >= 1 },
    { id: "quiz-starter", name: "Quiz Starter", description: "Complete your first quiz.", earned: count("quiz") >= 1 },
    { id: "quiz-regular", name: "Quiz Regular", description: "Complete five quizzes.", earned: count("quiz") >= 5 },
    { id: "english-explorer", name: "English Explorer", description: "Complete an English practice challenge.", earned: count("english") >= 1 },
    { id: "steady-learner", name: "Steady Learner", description: "Build a three-day learning streak.", earned: Number(profile.streakDays) >= 3 },
    { id: "century-club", name: "Century Club", description: "Earn 100 learning XP.", earned: Number(profile.totalXp) >= 100 }
  ];
  return badges;
}

async function getSnapshot(prisma, userId) {
  const [stored, events] = await Promise.all([
    prisma.userDataRecord.findUnique({ where: { userId_kind_recordId: { userId, kind: "learning-level", recordId: "main" } }, select: { data: true } }),
    prisma.userDataRecord.findMany({ where: { userId, kind: "learning-xp-events" }, orderBy: { createdAt: "desc" }, take: 100, select: { recordId: true, data: true, createdAt: true } })
  ]);
  const profile = { ...defaultProfile(), ...(stored?.data && typeof stored.data === "object" ? stored.data : {}) };
  return { ...levelForXp(profile.totalXp), dailyXp: Number(profile.dailyXp) || 0, dailyXpCap: DAILY_XP_CAP, streakDays: Number(profile.streakDays) || 0, badges: badgeList(events, profile), recentActivity: events.slice(0, 12).map(event => ({ id: event.recordId, ...event.data, createdAt: event.createdAt })) };
}

module.exports = { LEVEL_STEPS, DAILY_XP_CAP, levelForXp, awardXp, getSnapshot };
