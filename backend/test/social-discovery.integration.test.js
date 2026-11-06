"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

test("social discovery enforces visibility, blocks, presence, pagination and friend rules", {
  skip: process.env.RUN_DB_INTEGRATION !== "1"
}, async () => {
  const { app } = require("../src/app");
  const { prisma } = require("../src/prisma");
  const tag = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const users = [];
  let server;
  let baseUrl;

  async function createStudent(label, educationTrack = "SECONDARY", options = {}) {
    const user = await prisma.user.create({
      data: {
        name: label,
        email: `social-${tag}-${label.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.test`,
        passwordHash: "integration-test-only",
        educationTrack,
        institutionName: options.institutionName || "Test Institution",
        programme: options.programme || "Software Engineering",
        studyLevel: "Test level"
      }
    });
    users.push(user);
    const profile = await prisma.communityProfile.create({
      data: {
        userId: user.id,
        username: `s${tag}${users.length}`,
        usernameSet: true,
        visibility: options.visibility || "PUBLIC",
        status: options.status || "ACTIVE",
        lastSeenAt: options.lastSeenAt === undefined ? null : options.lastSeenAt,
        bestSubject: options.bestSubject || "Computer Science"
      }
    });
    return { user, profile };
  }

  function tokenFor(user) {
    return jwt.sign(
      { sub: user.id, sv: user.sessionVersion },
      process.env.JWT_SECRET,
      { algorithm: "HS256", issuer: "academic-tracker-api", audience: "academic-tracker-client", expiresIn: "10m" }
    );
  }

  async function request(path, user, options = {}) {
    return fetch(baseUrl + path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(user ? { Authorization: "Bearer " + tokenFor(user) } : {}),
        ...(options.headers || {})
      }
    });
  }

  try {
    const viewer = await createStudent("Discovery Viewer", "SECONDARY", {
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000)
    });
    const online = await createStudent("Online Higher Student", "HIGHER", {
      lastSeenAt: new Date(), institutionName: "Lagos Tech", programme: "Computer Engineering"
    });
    const offline = await createStudent("Offline Student", "SECONDARY", {
      lastSeenAt: new Date(Date.now() - 5 * 60 * 1000)
    });
    const privateStudent = await createStudent("Private Student", "SECONDARY", { visibility: "PRIVATE" });
    const suspendedStudent = await createStudent("Suspended Student", "SECONDARY", { status: "SUSPENDED" });
    const blockedStudent = await createStudent("Blocked Student", "SECONDARY");
    const requester = await createStudent("Incoming Requester", "SECONDARY");

    await prisma.communityBlock.create({
      data: { blockerId: viewer.user.id, blockedId: blockedStudent.user.id }
    });
    const incoming = await prisma.communityFollow.create({
      data: { followerId: requester.user.id, followingId: viewer.user.id, status: "PENDING" }
    });

    await new Promise((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", error => error ? reject(error) : resolve());
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const unauthorized = await request("/api/community/people", null);
    assert.equal(unauthorized.status, 401, "discovery must require authentication");

    const response = await request("/api/community/people?limit=20", viewer.user);
    assert.equal(response.status, 200);
    const data = await response.json();
    const byUsername = new Map(data.people.map(person => [person.username, person]));
    assert.ok(byUsername.has(online.profile.username), "public profiles from the other academic track should be discoverable");
    assert.ok(byUsername.has(offline.profile.username));
    assert.ok(!byUsername.has(viewer.profile.username), "the current user must not appear in their own discovery list");
    assert.ok(!byUsername.has(privateStudent.profile.username), "private profiles must not be discoverable");
    assert.ok(!byUsername.has(suspendedStudent.profile.username), "suspended profiles must not be discoverable");
    assert.ok(!byUsername.has(blockedStudent.profile.username), "blocked users must be excluded in both directions");
    assert.equal(byUsername.get(online.profile.username).online, true);
    assert.equal(byUsername.get(offline.profile.username).online, false);
    assert.equal(byUsername.get(online.profile.username).canFriend, false, "cross-track profiles are discoverable but cannot receive friend requests");

    const search = await request("/api/community/people?q=Computer%20Engineering", viewer.user);
    assert.equal(search.status, 200);
    const searchData = await search.json();
    assert.ok(searchData.people.some(person => person.username === online.profile.username), "search must include programme");

    const crossTrackRequest = await request("/api/community/follow/" + online.user.id, viewer.user, {
      method: "POST", body: "{}"
    });
    assert.equal(crossTrackRequest.status, 403, "the server must enforce same-track friend restrictions");

    const accept = await request("/api/community/friend-requests/" + incoming.id, viewer.user, {
      method: "POST", body: JSON.stringify({ action: "accept" })
    });
    assert.equal(accept.status, 200);
    const reciprocal = await prisma.communityFollow.findUnique({
      where: { followerId_followingId: { followerId: viewer.user.id, followingId: requester.user.id } }
    });
    assert.equal(reciprocal?.status, "ACCEPTED", "accepting a request must persist the reciprocal accepted relationship");

    const privateProfile = await request("/api/community/profiles/" + privateStudent.profile.username, viewer.user);
    assert.equal(privateProfile.status, 404);
    const suspendedProfile = await request("/api/community/profiles/" + suspendedStudent.profile.username, viewer.user);
    assert.equal(suspendedProfile.status, 404);

    const heartbeat = await request("/api/community/presence/heartbeat", viewer.user, {
      method: "POST", body: "{}"
    });
    assert.equal(heartbeat.status, 200);
    const refreshedViewer = await prisma.communityProfile.findUnique({ where: { id: viewer.profile.id } });
    assert.ok(refreshedViewer.lastSeenAt && Date.now() - refreshedViewer.lastSeenAt.getTime() < 5000);

    const pageUsers = [];
    for (let i = 0; i < 23; i++) pageUsers.push(await createStudent("Pagination Student " + i));
    const pageOneResponse = await request("/api/community/people?limit=10", viewer.user);
    assert.equal(pageOneResponse.status, 200);
    const pageOne = await pageOneResponse.json();
    assert.equal(pageOne.people.length, 10);
    assert.ok(pageOne.nextCursor);
    const pageTwoResponse = await request("/api/community/people?limit=10&cursor=" + encodeURIComponent(pageOne.nextCursor), viewer.user);
    assert.equal(pageTwoResponse.status, 200);
    const pageTwo = await pageTwoResponse.json();
    const firstIds = new Set(pageOne.people.map(person => person.username));
    assert.ok(pageTwo.people.every(person => !firstIds.has(person.username)), "cursor pages must not repeat profiles");

    // Read endpoints should not consume the write/action limiter budget.
    let lastRead;
    for (let i = 0; i < 82; i++) {
      lastRead = await request("/api/community/people?limit=1", viewer.user);
      if (lastRead.status !== 200) break;
    }
    assert.equal(lastRead.status, 200, "ordinary discovery reads must not trigger the social write-action limit");
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    const ids = users.map(user => user.id);
    if (ids.length) {
      await prisma.communityBlock.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
      await prisma.communityFollow.deleteMany({ where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] } });
      await prisma.communityProfile.deleteMany({ where: { userId: { in: ids } } });
      await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  }
});
