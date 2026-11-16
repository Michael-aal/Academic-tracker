"use strict";
const express = require("express");
const rateLimit = require("express-rate-limit");
const { randomBytes } = require("node:crypto");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 90,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: req => req.userId,
  message: { error: "Too many challenge actions. Please wait a moment." }
}));

const MODES = new Set(["DUEL", "TEAM", "FREE_FOR_ALL"]);
const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const timerValues = new Set([0, 10, 15, 20, 30, 60]);

function normalizeQuestions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    return { error: "A challenge must contain between 1 and 50 questions." };
  }
  const questions = [];
  for (let index = 0; index < value.length; index++) {
    const item = value[index] || {};
    const prompt = clean(item.prompt, 1200);
    const options = Array.isArray(item.options) ? item.options.slice(0, 6).map((option, optionIndex) => ({
      id: clean(option?.id, 80) || "option-" + optionIndex,
      text: clean(option?.text, 400)
    })) : [];
    const ids = new Set(options.map(option => option.id));
    const correctOptionId = clean(item.correctOptionId, 80);
    if (!prompt || options.length < 2 || options.some(option => !option.text) ||
        ids.size !== options.length || !ids.has(correctOptionId)) {
      return { error: "Question " + (index + 1) + " needs a prompt, at least two options and one correct answer." };
    }
    questions.push({
      id: clean(item.id, 80) || "question-" + (index + 1),
      prompt,
      options,
      correctOptionId,
      explanation: clean(item.explanation, 1000)
    });
  }
  return { questions };
}

function publicQuestions(challenge) {
  const reveal = challenge.status === "FINISHED";
  return (Array.isArray(challenge.questions) ? challenge.questions : []).map((question, index) => ({
    id: question.id || "question-" + (index + 1),
    prompt: question.prompt,
    options: question.options,
    ...(reveal ? { correctOptionId: question.correctOptionId, explanation: question.explanation || "" } : {})
  }));
}

async function participantData(participants) {
  const ids = [...new Set(participants.map(item => item.userId))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map(user => [user.id, user.name]));
  return participants.map(item => ({
    userId: item.userId,
    name: names.get(item.userId) || "Student",
    teamKey: item.teamKey,
    role: item.role,
    joinedAt: item.joinedAt
  }));
}

function buildRankings(challenge, participants, answers) {
  const teamMode = challenge.mode === "TEAM";
  const keys = [...new Set(participants.map(item => teamMode ? item.teamKey : item.userId).filter(Boolean))];
  const rows = keys.map(key => {
    const mine = answers.filter(answer => answer.competitorKey === key);
    const correct = mine.filter(answer => answer.isCorrect).length;
    const memberNames = teamMode
      ? participants.filter(item => item.teamKey === key).map(item => item.name)
      : participants.filter(item => item.userId === key).map(item => item.name);
    return {
      competitorKey: key,
      label: teamMode ? "Team " + key : (memberNames[0] || "Student"),
      members: memberNames,
      score: correct,
      answered: mine.length,
      totalQuestions: challenge.questions.length,
      completed: mine.length >= challenge.questions.length
    };
  });
  return rows.sort((a, b) => b.score - a.score || b.answered - a.answered || a.label.localeCompare(b.label))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function findChallenge(id) {
  return prisma.challenge.findUnique({
    where: { id },
    include: {
      participants: { orderBy: { joinedAt: "asc" } },
      answers: { orderBy: [{ questionIndex: "asc" }, { answeredAt: "asc" }] }
    }
  });
}

async function joinChallenge(challengeId, userId, teamKey) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "challenges" WHERE "id" = ${challengeId} FOR UPDATE`;
    const challenge = await tx.challenge.findUnique({
      where: { id: challengeId },
      include: { participants: { orderBy: { joinedAt: "asc" } } }
    });
    if (!challenge) return { status: 404, error: "Challenge not found." };
    if (challenge.status !== "LOBBY") return { status: 409, error: "This challenge has already started." };
    if (challenge.mode === "FREE_FOR_ALL" && challenge.hostUserId === userId) {
      return { status: 403, error: "The Mastermind organizes this tournament and does not compete." };
    }
    const existing = challenge.participants.find(item => item.userId === userId);
    if (existing) return { status: 200, participant: existing, existing: true };
    if (challenge.mode === "DUEL" && challenge.hostUserId !== userId) {
      const [host, joining, forward, reverse, blocked] = await Promise.all([
        tx.user.findUnique({ where: { id: challenge.hostUserId }, select: { educationTrack: true } }),
        tx.user.findUnique({ where: { id: userId }, select: { educationTrack: true } }),
        tx.communityFollow.findUnique({ where: { followerId_followingId: { followerId: challenge.hostUserId, followingId: userId } }, select: { status: true } }),
        tx.communityFollow.findUnique({ where: { followerId_followingId: { followerId: userId, followingId: challenge.hostUserId } }, select: { status: true } }),
        tx.communityBlock.findFirst({ where: { OR: [{ blockerId: challenge.hostUserId, blockedId: userId }, { blockerId: userId, blockedId: challenge.hostUserId }] }, select: { id: true } })
      ]);
      if (!host || !joining || host.educationTrack !== joining.educationTrack ||
          forward?.status !== "ACCEPTED" || reverse?.status !== "ACCEPTED" || blocked) {
        return { status: 403, error: "1v1 Duels are limited to accepted Preproom friends on the same academic track." };
      }
    }
    if (challenge.mode === "DUEL" && challenge.participants.length >= 2) return { status: 409, error: "This duel already has two competitors." };
    if (challenge.mode === "FREE_FOR_ALL" && challenge.participants.length >= 6) return { status: 409, error: "This tournament is full." };
    if (challenge.mode === "TEAM") {
      if (!["A", "B"].includes(teamKey)) return { status: 400, error: "Choose Team A or Team B." };
      const teamCount = challenge.participants.filter(item => item.teamKey === teamKey).length;
      if (teamCount >= 5) return { status: 409, error: "Each team can have at most five students." };
    }
    const participant = await tx.challengeParticipant.create({
      data: { challengeId, userId, teamKey: challenge.mode === "TEAM" ? teamKey : null }
    });
    return { status: 200, participant, existing: false };
  }, { isolationLevel: "Serializable" });
}

router.post("/", async (req, res, next) => {
  try {
    const mode = clean(req.body?.mode, 20).toUpperCase();
    const title = clean(req.body?.title, 120) || "Student challenge";
    const timerSeconds = Number(req.body?.timerSeconds ?? 0);
    const normalized = normalizeQuestions(req.body?.questions);
    if (!MODES.has(mode)) return res.status(400).json({ error: "Choose Duel, Team Challenge or Free-for-all." });
    if (normalized.error) return res.status(400).json({ error: normalized.error });
    if (!Number.isInteger(timerSeconds) || !timerValues.has(timerSeconds)) return res.status(400).json({ error: "Choose a supported timer per question." });
    const inviteCode = randomBytes(5).toString("hex").toUpperCase();
    const challenge = await prisma.challenge.create({
      data: {
        hostUserId: req.userId,
        mode,
        title,
        inviteCode,
        questions: normalized.questions,
        settings: { timerSeconds, source: clean(req.body?.source, 20) || "manual" }
      }
    });
    res.status(201).json({ challenge: { id: challenge.id, title: challenge.title, mode, inviteCode, status: challenge.status, questionCount: normalized.questions.length, timerSeconds } });
  } catch (error) { next(error); }
});

router.get("/mine", async (req, res, next) => {
  try {
    const records = await prisma.challenge.findMany({
      where: { OR: [{ hostUserId: req.userId }, { participants: { some: { userId: req.userId } } }] },
      include: { participants: { orderBy: { joinedAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
      take: 50
    });
    res.json({ challenges: records.map(item => ({
      id: item.id, title: item.title, mode: item.mode, status: item.status,
      inviteCode: item.hostUserId === req.userId ? item.inviteCode : undefined,
      questionCount: Array.isArray(item.questions) ? item.questions.length : 0,
      isHost: item.hostUserId === req.userId,
      participantCount: item.participants.length,
      createdAt: item.createdAt
    })) });
  } catch (error) { next(error); }
});

router.post("/join", async (req, res, next) => {
  const code = clean(req.body?.inviteCode, 16).toUpperCase();
  if (!/^[A-F0-9]{10}$/.test(code)) return res.status(400).json({ error: "Enter a valid in-app challenge code." });
  try {
    const challenge = await prisma.challenge.findUnique({ where: { inviteCode: code }, select: { id: true } });
    if (!challenge) return res.status(404).json({ error: "No challenge matches that code." });
    const result = await joinChallenge(challenge.id, req.userId, clean(req.body?.teamKey, 8).toUpperCase());
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(result.existing ? 200 : 201).json({ ok: true, challengeId: challenge.id, participant: result.participant });
  } catch (error) { next(error); }
});

router.post("/:id/join", async (req, res, next) => {
  try {
    const result = await joinChallenge(req.params.id, req.userId, clean(req.body?.teamKey, 8).toUpperCase());
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(result.existing ? 200 : 201).json({ ok: true, participant: result.participant });
  } catch (error) { next(error); }
});

router.post("/:id/start", async (req, res, next) => {
  try {
    const challenge = await prisma.challenge.findUnique({ where: { id: req.params.id }, include: { participants: true } });
    if (!challenge) return res.status(404).json({ error: "Challenge not found." });
    if (challenge.hostUserId !== req.userId) return res.status(403).json({ error: "Only the challenge host can start this room." });
    if (challenge.status !== "LOBBY") return res.status(409).json({ error: "This challenge is no longer waiting to start." });
    const players = challenge.participants;
    if (challenge.mode === "DUEL" && players.length !== 2) return res.status(409).json({ error: "A duel needs exactly two competitors." });
    if (challenge.mode === "FREE_FOR_ALL" && (players.length < 2 || players.length > 6)) return res.status(409).json({ error: "A tournament needs between two and six competitors." });
    if (challenge.mode === "TEAM") {
      const a = players.filter(item => item.teamKey === "A").length;
      const b = players.filter(item => item.teamKey === "B").length;
      if (a < 2 || b < 2) return res.status(409).json({ error: "Each team needs at least two students before the challenge can start." });
    }
    const updated = await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "ACTIVE", startedAt: new Date() } });
    res.json({ ok: true, status: updated.status, startedAt: updated.startedAt });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const challenge = await findChallenge(req.params.id);
    if (!challenge) return res.status(404).json({ error: "Challenge not found." });
    const isHost = challenge.hostUserId === req.userId;
    const mine = challenge.participants.find(item => item.userId === req.userId);
    if (!isHost && !mine) return res.status(403).json({ error: "Join this challenge before viewing its room." });
    const participants = await participantData(challenge.participants);
    const rankings = buildRankings(challenge, participants, challenge.answers);
    const competitorKey = challenge.mode === "TEAM" ? mine?.teamKey : req.userId;
    res.set("Cache-Control", "private, no-store");
    res.json({
      challenge: {
        id: challenge.id, title: challenge.title, mode: challenge.mode, status: challenge.status,
        hostUserId: challenge.hostUserId, isHost, inviteCode: isHost ? challenge.inviteCode : undefined,
        questions: publicQuestions(challenge), timerSeconds: Number(challenge.settings?.timerSeconds || 0),
        startedAt: challenge.startedAt, finishedAt: challenge.finishedAt, createdAt: challenge.createdAt
      },
      participants,
      rankings,
      myAnswers: challenge.answers.filter(answer => answer.competitorKey === competitorKey).map(answer => ({
        questionIndex: answer.questionIndex, optionId: answer.optionId, isCorrect: answer.isCorrect
      }))
    });
  } catch (error) { next(error); }
});

router.post("/:id/answer", async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "challenges" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const challenge = await tx.challenge.findUnique({
        where: { id: req.params.id },
        include: {
          participants: { orderBy: { joinedAt: "asc" } },
          answers: { orderBy: [{ questionIndex: "asc" }, { answeredAt: "asc" }] }
        }
      });
      if (!challenge) return { status: 404, error: "Challenge not found." };
      if (challenge.status !== "ACTIVE") return { status: 409, error: "This challenge is not accepting answers." };
      const participant = challenge.participants.find(item => item.userId === req.userId);
      if (!participant) return { status: 403, error: "Only competitors can submit answers." };
      const teamMode = challenge.mode === "TEAM";
      const competitorKey = teamMode ? participant.teamKey : req.userId;
      if (teamMode) {
        const captain = challenge.participants.filter(item => item.teamKey === participant.teamKey).sort((a, b) => a.joinedAt - b.joinedAt)[0];
        if (captain?.userId !== req.userId) return { status: 403, error: "Only the first joined teammate can submit the shared team answer." };
      }
      const questionIndex = req.body?.questionIndex;
      const optionId = req.body?.optionId === null ? null : clean(req.body?.optionId, 80) || null;
      if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= challenge.questions.length) {
        return { status: 400, error: "Choose a valid question." };
      }
      const existing = challenge.answers.filter(answer => answer.competitorKey === competitorKey);
      if (questionIndex !== existing.length) return { status: 409, error: "Answer the current question in order." };
      const question = challenge.questions[questionIndex];
      if (optionId && !question.options.some(option => option.id === optionId)) {
        return { status: 400, error: "Choose one of the available answers." };
      }
      const timerSeconds = Number(challenge.settings?.timerSeconds || 0);
      if (timerSeconds > 0 && challenge.startedAt) {
        const deadline = challenge.startedAt.getTime() + (questionIndex + 1) * timerSeconds * 1000;
        if (Date.now() > deadline && optionId) {
          return { status: 408, error: "The time for this question has ended. Submit it as unanswered to continue." };
        }
      }
      const isCorrect = Boolean(optionId && optionId === question.correctOptionId);
      await tx.challengeAnswer.create({
        data: { challengeId: challenge.id, questionIndex, competitorKey, optionId, isCorrect }
      });
      const refreshed = await tx.challenge.findUnique({
        where: { id: challenge.id },
        include: { participants: true, answers: true }
      });
      const competitors = teamMode
        ? [...new Set(refreshed.participants.map(item => item.teamKey).filter(Boolean))]
        : refreshed.participants.map(item => item.userId);
      const complete = competitors.length > 0 && competitors.every(key =>
        refreshed.answers.filter(answer => answer.competitorKey === key).length >= refreshed.questions.length
      );
      if (complete) {
        await tx.challenge.update({ where: { id: challenge.id }, data: { status: "FINISHED", finishedAt: new Date() } });
      }
      return {
        status: 200,
        body: {
          ok: true,
          isCorrect,
          answeredCount: refreshed.answers.filter(answer => answer.competitorKey === competitorKey).length,
          totalQuestions: refreshed.questions.length,
          status: complete ? "FINISHED" : "ACTIVE"
        }
      };
    }, { isolationLevel: "Serializable" });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(result.status).json(result.body);
  } catch (error) { next(error); }
});

router.post("/:id/finish", async (req, res, next) => {
  try {
    const challenge = await prisma.challenge.findUnique({ where: { id: req.params.id } });
    if (!challenge) return res.status(404).json({ error: "Challenge not found." });
    if (challenge.hostUserId !== req.userId) return res.status(403).json({ error: "Only the challenge host can finish this room." });
    if (challenge.status !== "ACTIVE") return res.status(409).json({ error: "This challenge is not active." });
    const updated = await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "FINISHED", finishedAt: new Date() } });
    res.json({ ok: true, status: updated.status });
  } catch (error) { next(error); }
});

router.get("/:id/messages", async (req, res, next) => {
  try {
    const challenge = await prisma.challenge.findUnique({ where: { id: req.params.id }, select: { id: true, mode: true, hostUserId: true } });
    if (!challenge) return res.status(404).json({ error: "Challenge not found." });
    const participant = await prisma.challengeParticipant.findUnique({ where: { challengeId_userId: { challengeId: challenge.id, userId: req.userId } } });
    if (!participant && challenge.hostUserId !== req.userId) return res.status(403).json({ error: "Join this challenge to view its chat." });
    if (challenge.mode !== "TEAM") return res.status(400).json({ error: "Team chat is available in Team Challenges." });
    const where = { challengeId: challenge.id };
    if (participant) where.teamKey = participant.teamKey;
    const messages = await prisma.challengeMessage.findMany({ where, orderBy: { createdAt: "asc" }, take: 100 });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(messages.map(item => item.userId))] } }, select: { id: true, name: true } });
    const names = new Map(users.map(user => [user.id, user.name]));
    res.json({ messages: messages.map(item => ({ id: item.id, userId: item.userId, name: names.get(item.userId) || "Student", body: item.body, createdAt: item.createdAt })) });
  } catch (error) { next(error); }
});

router.post("/:id/messages", async (req, res, next) => {
  try {
    const challenge = await prisma.challenge.findUnique({ where: { id: req.params.id }, select: { id: true, mode: true } });
    if (!challenge) return res.status(404).json({ error: "Challenge not found." });
    if (challenge.mode !== "TEAM") return res.status(400).json({ error: "Team chat is available in Team Challenges." });
    const participant = await prisma.challengeParticipant.findUnique({ where: { challengeId_userId: { challengeId: challenge.id, userId: req.userId } } });
    if (!participant) return res.status(403).json({ error: "Only team members can send messages." });
    const body = clean(req.body?.body, 1000);
    if (!body) return res.status(400).json({ error: "Write a message first." });
    const message = await prisma.challengeMessage.create({ data: { challengeId: challenge.id, userId: req.userId, teamKey: participant.teamKey, body } });
    res.status(201).json({ message: { id: message.id, body: message.body, createdAt: message.createdAt } });
  } catch (error) { next(error); }
});


router.get("/invitations", async (req, res, next) => {
  try {
    const rows = await prisma.notification.findMany({
      where: { userId: req.userId, category: "SOCIAL", readAt: null },
      orderBy: { createdAt: "desc" }, take: 60
    });
    const invitations = rows.filter(row => row.metadata?.type === "CHALLENGE_INVITE" && row.metadata?.status === "PENDING")
      .map(row => ({ notificationId: row.id, challengeId: row.metadata.challengeId, title: row.metadata.title || row.title, mode: row.metadata.mode || "DUEL", fromName: row.metadata.fromName || "A friend", teamKey: row.metadata.teamKey || null }));
    res.json({ invitations });
  } catch (error) { next(error); }
});

router.post("/:id/invitations", async (req, res, next) => {
  try {
    const challenge = await prisma.challenge.findUnique({ where: { id: req.params.id } });
    if (!challenge) return res.status(404).json({ error: "Challenge not found." });
    if (challenge.hostUserId !== req.userId || challenge.status !== "LOBBY") return res.status(403).json({ error: "Only the host can invite friends before the challenge starts." });
    const ids = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).filter(id => typeof id === "string" && id && id !== req.userId))].slice(0, 10);
    if (!ids.length) return res.status(400).json({ error: "Select at least one friend to invite." });
    if (challenge.mode === "DUEL" && ids.length > 1) return res.status(400).json({ error: "A 1v1 Duel can invite only one friend." });
    const [host, friends, outgoing, incoming, blocks] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, educationTrack: true } }),
      prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, educationTrack: true } }),
      prisma.communityFollow.findMany({ where: { followerId: req.userId, followingId: { in: ids }, status: "ACCEPTED" }, select: { followingId: true } }),
      prisma.communityFollow.findMany({ where: { followingId: req.userId, followerId: { in: ids }, status: "ACCEPTED" }, select: { followerId: true } }),
      prisma.communityBlock.findMany({ where: { OR: [{ blockerId: req.userId, blockedId: { in: ids } }, { blockedId: req.userId, blockerId: { in: ids } }] }, select: { blockerId: true, blockedId: true } })
    ]);
    const accepted = new Set(outgoing.map(row => row.followingId).filter(id => incoming.some(row => row.followerId === id)));
    const blocked = new Set(blocks.map(row => row.blockerId === req.userId ? row.blockedId : row.blockerId));
    if (!host || friends.length !== ids.length || ids.some(id => !accepted.has(id) || blocked.has(id) || friends.find(friend => friend.id === id)?.educationTrack !== host.educationTrack)) {
      return res.status(403).json({ error: "Invitations are limited to accepted, unblocked Preproom friends on your academic track." });
    }
    const existing = await prisma.challengeParticipant.findMany({ where: { challengeId: challenge.id, userId: { in: ids } }, select: { userId: true } });
    const alreadyJoined = new Set(existing.map(row => row.userId));
    const recipients = ids.filter(id => !alreadyJoined.has(id));
    if (!recipients.length) return res.status(409).json({ error: "All selected friends have already joined." });
    const userNames = await prisma.user.findMany({ where: { id: { in: recipients } }, select: { id: true } });
    await prisma.notification.createMany({ data: recipients.map(user => ({
      userId: user.id, createdById: req.userId, category: "SOCIAL",
      title: "Challenge invitation",
      body: host.name + " invited you to " + challenge.title + ".",
      metadata: { type: "CHALLENGE_INVITE", status: "PENDING", challengeId: challenge.id, title: challenge.title, mode: challenge.mode, fromName: host.name, teamKey: challenge.mode === "TEAM" && ["A","B"].includes(req.body?.teamKey) ? req.body.teamKey : null }
    })) });
    res.status(201).json({ ok: true, invited: recipients.length });
  } catch (error) { next(error); }
});

router.post("/:id/invitations/:notificationId/respond", async (req, res, next) => {
  try {
    const decision = clean(req.body?.decision, 12).toUpperCase();
    if (!["ACCEPT","DECLINE"].includes(decision)) return res.status(400).json({ error: "Choose accept or decline." });
    const notification = await prisma.notification.findFirst({ where: { id: req.params.notificationId, userId: req.userId, category: "SOCIAL" } });
    if (!notification || notification.metadata?.type !== "CHALLENGE_INVITE" || notification.metadata?.challengeId !== req.params.id || notification.metadata?.status !== "PENDING") {
      return res.status(404).json({ error: "This invitation is no longer available." });
    }
    if (decision === "DECLINE") {
      await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date(), metadata: { ...notification.metadata, status: "DECLINED" } } });
      return res.json({ ok: true, decision });
    }
    const challenge = await prisma.challenge.findUnique({ where: { id: req.params.id } });
    if (!challenge || challenge.status !== "LOBBY") return res.status(409).json({ error: "This challenge has already started or expired." });
    const joined = await joinChallenge(challenge.id, req.userId, clean(notification.metadata.teamKey, 8).toUpperCase());
    if (joined.error) return res.status(joined.status).json({ error: joined.error });
    await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date(), metadata: { ...notification.metadata, status: "ACCEPTED" } } });
    res.json({ ok: true, decision, challengeId: challenge.id });
  } catch (error) { next(error); }
});

module.exports = router;
