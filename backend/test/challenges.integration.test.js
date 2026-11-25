"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

test("challenge rooms enforce identical questions, competition roles, team answers and team chat", {
  skip: process.env.RUN_DB_INTEGRATION !== "1"
}, async () => {
  const { app } = require("../src/app");
  const { prisma } = require("../src/prisma");
  const tag = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const users = [];
  const challengeIds = [];
  let server;
  let baseUrl;

  async function createStudent(label) {
    const user = await prisma.user.create({
      data: {
        name: label,
        email: `challenge-${tag}-${label.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.test`,
        passwordHash: "integration-test-only",
        educationTrack: "SECONDARY"
      }
    });
    users.push(user);
    return user;
  }
  function tokenFor(user) {
    return jwt.sign(
      { sub: user.id, sv: user.sessionVersion },
      process.env.JWT_SECRET,
      { algorithm: "HS256", issuer: "academic-tracker-api", audience: "academic-tracker-client", expiresIn: "10m" }
    );
  }
  async function request(path, user, body, method = body ? "POST" : "GET") {
    return fetch(baseUrl + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        Authorization: "Bearer " + tokenFor(user)
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  }
  const questions = [{
    id: "q1",
    prompt: "Which planet is known as the Red Planet?",
    options: [
      { id: "a", text: "Venus" },
      { id: "b", text: "Mars" },
      { id: "c", text: "Jupiter" },
      { id: "d", text: "Mercury" }
    ],
    correctOptionId: "b",
    explanation: "Mars is commonly called the Red Planet."
  }];

  try {
    const host = await createStudent("Challenge Host");
    const opponent = await createStudent("Challenge Opponent");
    const teamA2 = await createStudent("Team A Second");
    const teamB1 = await createStudent("Team B Captain");
    const teamB2 = await createStudent("Team B Second");
    await prisma.communityFollow.createMany({ data: [
      { followerId: host.id, followingId: opponent.id, status: "ACCEPTED" },
      { followerId: opponent.id, followingId: host.id, status: "ACCEPTED" }
    ] });

    await new Promise((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", error => error ? reject(error) : resolve());
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Duel: both students receive the same saved set; answers and rankings are server-authoritative.
    let response = await request("/api/challenges", host, { mode: "DUEL", title: "Duel test", questions, timerSeconds: 0 });
    assert.equal(response.status, 201);
    let created = (await response.json()).challenge;
    challengeIds.push(created.id);
    response = await request("/api/challenges/" + created.id + "/join", host, {});
    assert.equal(response.status, 201);
    response = await request("/api/challenges/join", opponent, { inviteCode: created.inviteCode });
    assert.equal(response.status, 201);
    response = await request("/api/challenges/" + created.id + "/start", host, {});
    assert.equal(response.status, 200);
    const hostRoom = await (await request("/api/challenges/" + created.id, host)).json();
    const opponentRoom = await (await request("/api/challenges/" + created.id, opponent)).json();
    assert.deepEqual(hostRoom.challenge.questions, opponentRoom.challenge.questions);
    assert.equal(hostRoom.challenge.questions[0].correctOptionId, undefined, "answers must remain hidden while active");
    await request("/api/challenges/" + created.id + "/answer", host, { questionIndex: 0, optionId: "b" });
    await request("/api/challenges/" + created.id + "/answer", opponent, { questionIndex: 0, optionId: "a" });
    const finished = await (await request("/api/challenges/" + created.id, host)).json();
    assert.equal(finished.challenge.status, "FINISHED");
    assert.equal(finished.challenge.questions[0].correctOptionId, "b");
    assert.equal(finished.rankings[0].competitorKey, host.id);

    // Free-for-all: the Mastermind hosts but cannot become a competitor.
    response = await request("/api/challenges", host, { mode: "FREE_FOR_ALL", title: "Mastermind test", questions, timerSeconds: 0 });
    created = (await response.json()).challenge;
    challengeIds.push(created.id);
    response = await request("/api/challenges/" + created.id + "/join", host, {});
    assert.equal(response.status, 403);
    await request("/api/challenges/join", opponent, { inviteCode: created.inviteCode });
    await request("/api/challenges/join", teamA2, { inviteCode: created.inviteCode });
    response = await request("/api/challenges/" + created.id + "/start", host, {});
    assert.equal(response.status, 200);
    const mastermindRoom = await (await request("/api/challenges/" + created.id, host)).json();
    assert.equal(mastermindRoom.challenge.isHost, true);
    assert.equal(mastermindRoom.myAnswers.length, 0);
    assert.equal(mastermindRoom.participants.length, 2);

    // Team mode: only the first joined teammate can submit the shared answer; chats are isolated by team.
    response = await request("/api/challenges", host, { mode: "TEAM", title: "Team test", questions, timerSeconds: 0 });
    created = (await response.json()).challenge;
    challengeIds.push(created.id);
    await request("/api/challenges/" + created.id + "/join", host, { teamKey: "A" });
    await request("/api/challenges/" + created.id + "/join", teamA2, { teamKey: "A" });
    await request("/api/challenges/" + created.id + "/join", teamB1, { teamKey: "B" });
    await request("/api/challenges/" + created.id + "/join", teamB2, { teamKey: "B" });
    response = await request("/api/challenges/" + created.id + "/start", host, {});
    assert.equal(response.status, 200);
    response = await request("/api/challenges/" + created.id + "/answer", teamA2, { questionIndex: 0, optionId: "b" });
    assert.equal(response.status, 403, "a non-captain cannot submit a shared answer");
    await request("/api/challenges/" + created.id + "/messages", host, { body: "Team A, let's review the question." });
    const teamAMessages = await (await request("/api/challenges/" + created.id + "/messages", teamA2)).json();
    const teamBMessages = await (await request("/api/challenges/" + created.id + "/messages", teamB1)).json();
    assert.equal(teamAMessages.messages.length, 1);
    assert.equal(teamBMessages.messages.length, 0);

    // Closing a live room must preserve history and atomically make all writes read-only.
    response = await request("/api/challenges/" + created.id + "/answer", host, { questionIndex: 0, optionId: "b" });
    assert.equal(response.status, 200);
    response = await request("/api/challenges/" + created.id + "/close", host, {});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "CLOSED");
    const closedRoom = await (await request("/api/challenges/" + created.id, host)).json();
    assert.equal(closedRoom.challenge.status, "CLOSED");
    assert.equal(closedRoom.challenge.questions[0].correctOptionId, "b");
    assert.equal(closedRoom.myAnswers.length, 1, "answers must remain available in closed challenge history");
    const preservedMessages = await (await request("/api/challenges/" + created.id + "/messages", teamA2)).json();
    assert.equal(preservedMessages.messages.length, 1, "team chat history must remain readable after closure");
    response = await request("/api/challenges/" + created.id + "/messages", host, { body: "This must not be saved." });
    assert.equal(response.status, 409, "closed team chat must reject new messages");
    response = await request("/api/challenges/" + created.id + "/answer", host, { questionIndex: 1, optionId: "a" });
    assert.equal(response.status, 409, "closed challenges must reject further answers");
    const lateJoiner = await createStudent("Late Joiner");
    response = await request("/api/challenges/join", lateJoiner, { inviteCode: created.inviteCode });
    assert.equal(response.status, 409, "closed challenges must reject new participants");
  } finally {
    if (challengeIds.length) await prisma.challenge.deleteMany({ where: { id: { in: challengeIds } } });
    if (users.length) {
      const ids = users.map(user => user.id);
      await prisma.communityFollow.deleteMany({ where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (server) await new Promise(resolve => server.close(resolve));
  }
});
