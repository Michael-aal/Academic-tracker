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
    const blockingStudent = await createStudent("Blocking Student", "SECONDARY");
    const requester = await createStudent("Incoming Requester", "SECONDARY");
    const sameTrack = await createStudent("Same Track Candidate", "SECONDARY");
    const decliner = await createStudent("Decline Requester", "SECONDARY");

    await prisma.communityBlock.createMany({ data: [
      { blockerId: viewer.user.id, blockedId: blockedStudent.user.id },
      { blockerId: blockingStudent.user.id, blockedId: viewer.user.id }
    ] });
    const incoming = await prisma.communityFollow.create({
      data: { followerId: requester.user.id, followingId: viewer.user.id, status: "PENDING" }
    });
    const incomingToDecline = await prisma.communityFollow.create({
      data: { followerId: decliner.user.id, followingId: viewer.user.id, status: "PENDING" }
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
    assert.ok(!byUsername.has(blockedStudent.profile.username), "users blocked by the viewer must be excluded");
    assert.ok(!byUsername.has(blockingStudent.profile.username), "users who blocked the viewer must also be excluded");
    assert.equal(byUsername.get(online.profile.username).online, true);
    assert.equal(byUsername.get(offline.profile.username).online, false);
    assert.equal(byUsername.get(online.profile.username).canFriend, false, "cross-track profiles are discoverable but cannot receive friend requests");

    const publicProfile = await request("/api/community/profiles/" + online.profile.username, viewer.user);
    assert.equal(publicProfile.status, 200);
    const publicProfileData = await publicProfile.json();
    assert.equal(publicProfileData.relationship.canFriend, false, "public profiles should expose connection eligibility without allowing cross-track requests");

    const blockedProfile = await request("/api/community/profiles/" + blockedStudent.profile.username, viewer.user);
    assert.equal(blockedProfile.status, 404, "blocked profiles must not be accessible");
    const blockListResponse = await request("/api/community/blocks", viewer.user);
    assert.equal(blockListResponse.status, 200);
    assert.ok((await blockListResponse.json()).blocks.some(item => item.blockedId === blockedStudent.user.id));
    const unblock = await request("/api/community/blocks/" + blockedStudent.user.id, viewer.user, { method: "DELETE" });
    assert.equal(unblock.status, 200);
    const afterUnblock = await request("/api/community/people?limit=30", viewer.user);
    assert.ok((await afterUnblock.json()).people.some(person => person.username === blockedStudent.profile.username), "unblocked public users should become discoverable again");

    const usernameSearch = await request("/api/community/people?q=%40" + encodeURIComponent(online.profile.username), viewer.user);
    assert.equal(usernameSearch.status, 200);
    assert.ok((await usernameSearch.json()).people.some(person => person.username === online.profile.username), "search must support @username");

    const search = await request("/api/community/people?q=Computer%20Engineering", viewer.user);
    assert.equal(search.status, 200);
    const searchData = await search.json();
    assert.ok(searchData.people.some(person => person.username === online.profile.username), "search must include programme");

    const crossTrackRequest = await request("/api/community/follow/" + online.user.id, viewer.user, {
      method: "POST", body: "{}"
    });
    assert.equal(crossTrackRequest.status, 403, "the server must enforce same-track friend restrictions");

    const externalMediaPost = await request("/api/community/posts", viewer.user, {
      method: "POST", body: JSON.stringify({ body: "Reject unverified external media", mediaUrl: "https://example.com/unverified.jpg" })
    });
    assert.equal(externalMediaPost.status, 400, "the server must reject media not uploaded to the signed user Cloudinary folder");

    const sameTrackRequest = await request("/api/community/follow/" + sameTrack.user.id, viewer.user, {
      method: "POST", body: "{}"
    });
    assert.equal(sameTrackRequest.status, 200);
    assert.equal((await sameTrackRequest.json()).status, "PENDING", "same-track users should be able to send a persisted friend request");
    const duplicateRequest = await request("/api/community/follow/" + sameTrack.user.id, viewer.user, { method: "POST", body: "{}" });
    assert.equal(duplicateRequest.status, 200);
    assert.equal(await prisma.communityFollow.count({ where: { followerId: viewer.user.id, followingId: sameTrack.user.id } }), 1, "repeated requests must not create duplicates");
    const cancelRequest = await request("/api/community/follow/" + sameTrack.user.id, viewer.user, { method: "DELETE" });
    assert.equal(cancelRequest.status, 200);
    assert.equal(await prisma.communityFollow.count({ where: { followerId: viewer.user.id, followingId: sameTrack.user.id } }), 0, "cancelling must remove the pending request");
    const selfRequest = await request("/api/community/follow/" + viewer.user.id, viewer.user, { method: "POST", body: "{}" });
    assert.equal(selfRequest.status, 404, "users cannot send friend requests to themselves");

    const declineRequest = await request("/api/community/friend-requests/" + incomingToDecline.id, viewer.user, {
      method: "POST", body: JSON.stringify({ action: "decline" })
    });
    assert.equal(declineRequest.status, 200);
    assert.equal(await prisma.communityFollow.count({ where: { id: incomingToDecline.id } }), 0, "declining must remove the pending request");

    const accept = await request("/api/community/friend-requests/" + incoming.id, viewer.user, {
      method: "POST", body: JSON.stringify({ action: "accept" })
    });
    assert.equal(accept.status, 200);
    const reciprocal = await prisma.communityFollow.findUnique({
      where: { followerId_followingId: { followerId: viewer.user.id, followingId: requester.user.id } }
    });
    assert.equal(reciprocal?.status, "ACCEPTED", "accepting a request must persist the reciprocal accepted relationship");

    const postResponse = await request("/api/community/posts", viewer.user, {
      method: "POST", body: JSON.stringify({ body: "A real integration-test post", visibility: "PUBLIC" })
    });
    assert.equal(postResponse.status, 201);
    const createdPost = (await postResponse.json()).post;
    assert.equal(createdPost.isOwner, true);
    assert.equal(createdPost.authorId, undefined, "post APIs must not expose account IDs");

    const feedResponse = await request("/api/community/feed?limit=20", requester.user);
    assert.equal(feedResponse.status, 200);
    const feed = await feedResponse.json();
    const visiblePost = feed.posts.find(post => post.id === createdPost.id);
    assert.ok(visiblePost);
    assert.equal(visiblePost.authorId, undefined);
    assert.equal(visiblePost.author.userId, undefined);
    assert.equal(visiblePost.author.id, undefined);

    const commentResponse = await request("/api/community/posts/" + createdPost.id + "/comments", requester.user, {
      method: "POST", body: JSON.stringify({ body: "Useful explanation." })
    });
    assert.equal(commentResponse.status, 201);
    const createdComment = (await commentResponse.json()).comment;
    assert.equal(createdComment.isMine, true);
    assert.equal(createdComment.userId, undefined);
    const commentsResponse = await request("/api/community/posts/" + createdPost.id + "/comments", viewer.user);
    const commentsData = await commentsResponse.json();
    assert.equal(commentsData.comments[0].userId, undefined);

    const directChat = await request("/api/community/chat/direct/" + requester.profile.username, viewer.user, {
      method: "POST", body: "{}"
    });
    assert.equal(directChat.status, 201);
    const conversation = (await directChat.json()).conversation;
    assert.equal(conversation.createdById, undefined);
    const sentMessage = await request("/api/community/chat/" + conversation.id + "/messages", viewer.user, {
      method: "POST", body: JSON.stringify({ body: "Hello from the integration test." })
    });
    assert.equal(sentMessage.status, 201);
    assert.equal((await sentMessage.json()).message.senderId, undefined);
    const chatList = await request("/api/community/chat", requester.user);
    const chatData = await chatList.json();
    const listedConversation = chatData.conversations.find(item => item.id === conversation.id);
    assert.ok(listedConversation);
    assert.ok(listedConversation.members.every(member => member.userId === undefined));
    assert.equal(listedConversation.lastMessage.senderId, undefined);
    const chatMessages = await request("/api/community/chat/" + conversation.id + "/messages", requester.user);
    const chatMessageData = await chatMessages.json();
    assert.equal(chatMessageData.messages[0].senderId, undefined);
    assert.equal(chatMessageData.messages[0].isMine, false);

    const notificationResponse = await request("/api/notifications", requester.user);
    const notificationData = await notificationResponse.json();
    assert.ok(notificationData.notifications.some(item => item.title === "New message"));
    assert.ok(notificationData.notifications.every(item => item.userId === undefined && item.createdById === undefined));

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
