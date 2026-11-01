"use strict";
const express = require("express");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();

// Public, read-only probe used to distinguish an API deployment/mount problem
// from authentication or username-onboarding failures on protected endpoints.
router.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, service: "academic-tracker-social-api" });
});
const writeLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 80, standardHeaders: "draft-7", legacyHeaders: false,
  keyGenerator: req => req.userId,
  message: { error: "Too many community actions. Please slow down." }
});
const clean = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
const safeUrl = value => {
  const raw = clean(value, 1000);
  if (!raw) return null;
  try { const u = new URL(raw); return u.protocol === "https:" ? raw : null; } catch { return null; }
};
const slug = value => clean(value, 30).toLowerCase().replace(/[^a-z0-9_]/g, "").replace(/^_+|_+$/g, "");
const publicProfile = (profile, user) => ({
  id: profile.id, userId: user.id, username: profile.username, usernameSet: profile.usernameSet, displayName: user.name,
  educationTrack: user.educationTrack, institutionName: user.institutionName,
  programme: user.programme, studyLevel: user.studyLevel, bio: profile.bio,
  bestSubject: profile.bestSubject, interests: profile.interests || [],
  avatarUrl: profile.avatarUrl, coverUrl: profile.coverUrl, visibility: profile.visibility
});
async function getUser(userId) {
  return prisma.user.findUnique({ where: { id: userId }, select: {
    id: true, name: true, educationTrack: true, institutionName: true, programme: true,
    studyLevel: true, role: true
  }});
}
async function ensureProfile(user) {
  let profile = await prisma.communityProfile.findUnique({ where: { userId: user.id } });
  if (profile) return profile;
  const base = slug(user.name) || "student";
  const username = (base.slice(0, 22) + "_" + user.id.slice(-6)).slice(0, 30);
  return prisma.communityProfile.create({ data: { userId: user.id, username } });
}
async function isBlocked(userA, userB) {
  if (!userA || !userB) return false;
  return Boolean(await prisma.communityBlock.findFirst({ where: { OR: [{ blockerId: userA, blockedId: userB }, { blockerId: userB, blockedId: userA }] } }));
}
async function acceptedFriend(userA, userB) {
  if (!userA || !userB || userA.id === userB.id || userA.educationTrack !== userB.educationTrack || await isBlocked(userA.id, userB.id)) return false;
  const [ab, ba] = await Promise.all([
    prisma.communityFollow.findUnique({ where: { followerId_followingId: { followerId: userA.id, followingId: userB.id } } }),
    prisma.communityFollow.findUnique({ where: { followerId_followingId: { followerId: userB.id, followingId: userA.id } } })
  ]);
  return ab?.status === "ACCEPTED" && ba?.status === "ACCEPTED";
}
async function notifySocial(userId, actorId, title, body, metadata) {
  if (!userId || userId === actorId) return;
  try {
    await prisma.notification.create({ data: {
      userId, createdById: actorId, title: clean(title, 120), body: clean(body, 4000),
      category: "SOCIAL", metadata: metadata || {}
    }});
  } catch (_) {
    // A notification failure must not roll back the social action itself.
  }
}
async function isMember(conversationId, userId) {
  return Boolean(await prisma.chatMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } }));
}
async function canReadPost(post, userId) {
  if (post.authorId !== userId && await isBlocked(post.authorId, userId)) return false;
  if (post.visibility === "PUBLIC" || post.authorId === userId) return true;
  if (post.visibility === "FOLLOWERS") {
    const [outgoing, incoming] = await Promise.all([
      prisma.communityFollow.findUnique({ where: { followerId_followingId: { followerId: userId, followingId: post.authorId } } }),
      prisma.communityFollow.findUnique({ where: { followerId_followingId: { followerId: post.authorId, followingId: userId } } })
    ]);
    return outgoing?.status === "ACCEPTED" && incoming?.status === "ACCEPTED";
  }
  return false;
}

router.use(requireAuth);
router.use(async (req, res, next) => {
  if (req.path === "/profile/me" && ["GET", "PATCH"].includes(req.method)) return next();
  try {
    const profile = await prisma.communityProfile.findUnique({ where: { userId: req.userId }, select: { usernameSet: true } });
    if (!profile?.usernameSet) return res.status(403).json({ error: "Choose your unique Social Media username before continuing.", code: "SOCIAL_USERNAME_REQUIRED" });
    next();
  } catch (error) { next(error); }
});
// Public discovery is read-only. Authentication is required for participation.
router.get("/feed", async (req, res, next) => {
  try {
    const limit = Math.min(30, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const [outgoingFriends, incomingFriends, blockRows] = await Promise.all([
      prisma.communityFollow.findMany({ where: { followerId: req.userId, status: "ACCEPTED" }, select: { followingId: true } }),
      prisma.communityFollow.findMany({ where: { followingId: req.userId, status: "ACCEPTED" }, select: { followerId: true } }),
      prisma.communityBlock.findMany({ where: { OR: [{ blockerId: req.userId }, { blockedId: req.userId }] }, select: { blockerId: true, blockedId: true } })
    ]);
    const incomingIds = new Set(incomingFriends.map(x => x.followerId));
    const friendIds = outgoingFriends.map(x => x.followingId).filter(id => incomingIds.has(id));
    const blockedIds = [...new Set(blockRows.map(row => row.blockerId === req.userId ? row.blockedId : row.blockerId))];
    const where = { AND: [{ OR: [
      { visibility: "PUBLIC" },
      { authorId: req.userId },
      ...(friendIds.length ? [{ visibility: "FOLLOWERS", authorId: { in: friendIds } }] : [])
    ] }, { authorId: { notIn: blockedIds } }] };
    if (req.query.subject) where.AND.push({ subject: clean(req.query.subject, 100) });
    if (req.query.track === "SECONDARY" || req.query.track === "HIGHER") {
      const users = await prisma.user.findMany({ where: { educationTrack: req.query.track }, select: { id: true } });
      where.AND.push({ authorId: { in: users.map(x => x.id) } });
    }
    const posts = await prisma.communityPost.findMany({
      where, orderBy: { createdAt: "desc" }, take: limit,
      ...(typeof req.query.before === "string" && req.query.before ? { cursor: { id: req.query.before }, skip: 1 } : {})
    });
    posts.sort((a,b) => {
      const aRank = a.authorId === req.userId || friendIds.includes(a.authorId) ? 0 : 1;
      const bRank = b.authorId === req.userId || friendIds.includes(b.authorId) ? 0 : 1;
      return aRank - bRank || new Date(b.createdAt) - new Date(a.createdAt);
    });
    const ids = [...new Set(posts.map(p => p.authorId))];
    const postIds = posts.map(p => p.id);
    const [users, profiles, reactions, comments, shares, savedRows, sharedOriginals, myReactions] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, educationTrack: true, institutionName: true, programme: true, studyLevel: true } }),
      prisma.communityProfile.findMany({ where: { userId: { in: ids } } }),
      prisma.communityReaction.groupBy({ by: ["postId"], where: { postId: { in: postIds } }, _count: { _all: true } }),
      prisma.communityComment.groupBy({ by: ["postId"], where: { postId: { in: postIds } }, _count: { _all: true } }),
      prisma.communityPost.groupBy({ by: ["sharedPostId"], where: { sharedPostId: { in: postIds } }, _count: { _all: true } }),
      prisma.communitySavedPost.findMany({ where: { userId: req.userId, postId: { in: postIds } }, select: { postId: true } }),
      prisma.communityPost.findMany({ where: { id: { in: posts.map(p => p.sharedPostId).filter(Boolean) } } }),
      prisma.communityReaction.findMany({ where: { postId: { in: postIds }, userId: req.userId }, select: { postId: true } })
    ]);
    const readableSharedOriginals = [];
    for (const original of sharedOriginals) if (await canReadPost(original, req.userId)) readableSharedOriginals.push(original);
    const sharedAuthorIds = [...new Set(readableSharedOriginals.map(p => p.authorId))];
    const [sharedUsers, sharedProfiles] = sharedOriginals.length ? await Promise.all([
      prisma.user.findMany({ where: { id: { in: sharedAuthorIds } }, select: { id: true, name: true, educationTrack: true, institutionName: true, programme: true, studyLevel: true } }),
      prisma.communityProfile.findMany({ where: { userId: { in: sharedAuthorIds } } })
    ]) : [[], []];
    const userMap = new Map(users.map(u => [u.id, u]));
    const profileMap = new Map(profiles.map(p => [p.userId, p]));
    const reactionMap = new Map(reactions.map(x => [x.postId, x._count._all]));
    const commentMap = new Map(comments.map(x => [x.postId, x._count._all]));
    const shareMap = new Map(shares.map(x => [x.sharedPostId, x._count._all]));
    const savedSet = new Set(savedRows.map(x => x.postId));
    const likedSet = new Set(myReactions.map(x => x.postId));
    const sharedUserMap = new Map(sharedUsers.map(u => [u.id, u]));
    const sharedProfileMap = new Map(sharedProfiles.map(p => [p.userId, p]));
    const sharedMap = new Map(readableSharedOriginals.map(p => [p.id, {
      ...p,
      author: sharedUserMap.get(p.authorId) ? publicProfile(sharedProfileMap.get(p.authorId) || { username: "student", bio: null, bestSubject: null, interests: [], avatarUrl: null, coverUrl: null, visibility: "PUBLIC" }, sharedUserMap.get(p.authorId)) : null
    }]));
    res.json({ posts: posts.map(p => ({
      ...p, author: userMap.get(p.authorId) ? publicProfile(profileMap.get(p.authorId) || { username: "student", bio: null, bestSubject: null, interests: [], avatarUrl: null, coverUrl: null, visibility: "PUBLIC" }, userMap.get(p.authorId)) : null,
      sharedPost: p.sharedPostId ? sharedMap.get(p.sharedPostId) || null : null,
      isSaved: savedSet.has(p.id), isLiked: likedSet.has(p.id), shareCount: shareMap.get(p.id) || 0,
      isFriendPost: p.authorId === req.userId || friendIds.includes(p.authorId),
      reactionCount: reactionMap.get(p.id) || 0, commentCount: commentMap.get(p.id) || 0
    }))});
  } catch (e) { next(e); }
});

router.get("/profiles/:username", async (req, res, next) => {
  try {
    const profile = await prisma.communityProfile.findUnique({ where: { username: slug(req.params.username) } });
    if (!profile || profile.visibility === "PRIVATE" || await isBlocked(profile.userId, req.userId)) return res.status(404).json({ error: "Student profile not found." });
    const user = await getUser(profile.userId);
    if (!user) return res.status(404).json({ error: "Student profile not found." });
    const posts = await prisma.communityPost.findMany({ where: { authorId: user.id, visibility: "PUBLIC" }, orderBy: { createdAt: "desc" }, take: 20 });
    res.json({ profile: publicProfile(profile, user), posts });
  } catch (e) { next(e); }
});

router.use(writeLimit);

router.get("/profile/me", async (req, res, next) => {
  try {
    const user = await getUser(req.userId);
    if (!user) return res.status(404).json({ error: "Account not found." });
    const profile = await ensureProfile(user);
    const [posts, outgoing, incoming] = await Promise.all([
      prisma.communityPost.findMany({ where: { authorId: req.userId }, orderBy: { createdAt: "desc" }, take: 60 }),
      prisma.communityFollow.findMany({ where: { followerId: req.userId, status: "ACCEPTED" }, select: { followingId: true } }),
      prisma.communityFollow.findMany({ where: { followingId: req.userId, status: "ACCEPTED" }, select: { followerId: true } })
    ]);
    const incomingFriendIds = new Set(incoming.map(x => x.followerId));
    const friends = outgoing.filter(x => incomingFriendIds.has(x.followingId)).length;
    const postIds = posts.map(post => post.id);
    const [reactions, comments, shares] = postIds.length ? await Promise.all([
      prisma.communityReaction.groupBy({ by: ["postId"], where: { postId: { in: postIds } }, _count: { _all: true } }),
      prisma.communityComment.groupBy({ by: ["postId"], where: { postId: { in: postIds } }, _count: { _all: true } }),
      prisma.communityPost.groupBy({ by: ["sharedPostId"], where: { sharedPostId: { in: postIds } }, _count: { _all: true } })
    ]) : [[], [], []];
    const reactionCounts = new Map(reactions.map(item => [item.postId, item._count._all]));
    const commentCounts = new Map(comments.map(item => [item.postId, item._count._all]));
    const shareCounts = new Map(shares.map(item => [item.sharedPostId, item._count._all]));
    const totalLikes = reactions.reduce((sum, item) => sum + item._count._all, 0);
    res.json({
      profile: publicProfile(profile, user),
      stats: { posts: posts.length, friends, likes: totalLikes },
      posts: posts.map(post => ({ ...post, reactionCount: reactionCounts.get(post.id) || 0, commentCount: commentCounts.get(post.id) || 0, shareCount: shareCounts.get(post.id) || 0 }))
    });
  } catch (e) { next(e); }
});

router.patch("/profile/me", async (req, res, next) => {
  try {
    const user = await getUser(req.userId);
    if (!user) return res.status(404).json({ error: "Account not found." });
    const data = {};
    if (req.body?.username !== undefined) {
      const username = clean(req.body.username, 30).toLowerCase();
      if (!/^[a-z0-9_]{3,30}$/.test(username)) return res.status(400).json({ error: "Username must be 3–30 characters using letters, numbers or underscores." });
      data.username = username;
      data.usernameSet = true;
    }
    if (req.body?.bio !== undefined) data.bio = clean(req.body.bio, 280) || null;
    if (req.body?.bestSubject !== undefined) data.bestSubject = clean(req.body.bestSubject, 100) || null;
    if (req.body?.avatarUrl !== undefined) {
      const url = safeUrl(req.body.avatarUrl); if (req.body.avatarUrl && !url) return res.status(400).json({ error: "Profile image must use a valid HTTPS URL." });
      data.avatarUrl = url;
    }
    if (req.body?.coverUrl !== undefined) {
      const url = safeUrl(req.body.coverUrl); if (req.body.coverUrl && !url) return res.status(400).json({ error: "Cover image must use a valid HTTPS URL." });
      data.coverUrl = url;
    }
    if (req.body?.visibility !== undefined) {
      if (!["PUBLIC", "PRIVATE"].includes(req.body.visibility)) return res.status(400).json({ error: "Choose public or private profile visibility." });
      data.visibility = req.body.visibility;
    }
    if (req.body?.interests !== undefined) {
      if (!Array.isArray(req.body.interests) || req.body.interests.length > 12 || req.body.interests.some(x => typeof x !== "string" || !x.trim() || x.length > 40)) return res.status(400).json({ error: "Choose up to 12 valid interests." });
      data.interests = [...new Set(req.body.interests.map(x => x.trim()))];
    }
    const current = await ensureProfile(user);
    const profile = Object.keys(data).length ? await prisma.communityProfile.update({ where: { id: current.id }, data }) : current;
    res.json({ profile: publicProfile(profile, user) });
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "That username is already taken." });
    next(e);
  }
});


router.post("/media-upload-signature", async (req, res, next) => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) return res.status(503).json({ error: "Community media storage is not configured. Ask the administrator to configure Cloudinary." });
    const resourceType = req.body?.resourceType === "video" ? "video" : "image";
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "academic-tracker/community/" + req.userId;
    const signature = crypto.createHash("sha1").update("folder=" + folder + "&timestamp=" + timestamp + apiSecret).digest("hex");
    res.json({ cloudName, apiKey, timestamp, folder, signature, resourceType });
  } catch (e) { next(e); }
});

router.post("/posts", async (req, res, next) => {
  try {
    const body = clean(req.body?.body, 5000);
    const mediaUrl = req.body?.mediaUrl ? safeUrl(req.body.mediaUrl) : null;
    const videoUrl = req.body?.videoUrl ? safeUrl(req.body.videoUrl) : null;
    const subject = clean(req.body?.subject, 100) || null;
    const visibility = ["PUBLIC", "FOLLOWERS"].includes(req.body?.visibility) ? req.body.visibility : "PUBLIC";
    if (!body && !mediaUrl && !videoUrl) return res.status(400).json({ error: "Write something or attach a valid HTTPS media link." });
    if (req.body?.mediaUrl && !mediaUrl || req.body?.videoUrl && !videoUrl) return res.status(400).json({ error: "Media links must use HTTPS." });
    const post = await prisma.communityPost.create({ data: { authorId: req.userId, body, mediaUrl, videoUrl, subject, visibility } });
    res.status(201).json({ post });
  } catch (e) { next(e); }
});

router.post("/posts/:id/share", async (req, res, next) => {
  try {
    const original = await prisma.communityPost.findUnique({ where: { id: req.params.id } });
    if (!original || !await canReadPost(original, req.userId)) return res.status(404).json({ error: "Post not found." });
    const body = clean(req.body?.body, 5000);
    const visibility = ["PUBLIC", "FOLLOWERS"].includes(req.body?.visibility) ? req.body.visibility : "PUBLIC";
    const post = await prisma.communityPost.create({ data: {
      authorId: req.userId, body, sharedPostId: original.id, subject: original.subject, visibility
    }});
    await notifySocial(original.authorId, req.userId, "Your post was shared", "A student shared one of your posts.", { type: "POST_SHARED", postId: original.id });
    res.status(201).json({ post });
  } catch (e) { next(e); }
});

router.post("/posts/:id/save", async (req, res, next) => {
  try {
    const post = await prisma.communityPost.findUnique({ where: { id: req.params.id } });
    if (!post || !await canReadPost(post, req.userId)) return res.status(404).json({ error: "Post not found." });
    const existing = await prisma.communitySavedPost.findUnique({ where: { userId_postId: { userId: req.userId, postId: post.id } } });
    if (existing) {
      await prisma.communitySavedPost.delete({ where: { id: existing.id } });
      return res.json({ ok: true, saved: false });
    }
    await prisma.communitySavedPost.create({ data: { userId: req.userId, postId: post.id } });
    res.json({ ok: true, saved: true });
  } catch (e) { next(e); }
});

router.get("/saved-posts", async (req, res, next) => {
  try {
    const saved = await prisma.communitySavedPost.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, take: 100 });
    const ids = saved.map(x => x.postId);
    const posts = ids.length ? await prisma.communityPost.findMany({ where: { id: { in: ids } } }) : [];
    const readable = [];
    for (const post of posts) if (await canReadPost(post, req.userId)) readable.push(post);
    const authorIds = [...new Set(readable.map(p => p.authorId))];
    const [users, profiles, reactions, comments] = readable.length ? await Promise.all([
      prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, educationTrack: true, institutionName: true, programme: true, studyLevel: true } }),
      prisma.communityProfile.findMany({ where: { userId: { in: authorIds } } }),
      prisma.communityReaction.groupBy({ by: ["postId"], where: { postId: { in: readable.map(p => p.id) } }, _count: { _all: true } }),
      prisma.communityComment.groupBy({ by: ["postId"], where: { postId: { in: readable.map(p => p.id) } }, _count: { _all: true } })
    ]) : [[], [], [], []];
    const userMap = new Map(users.map(u => [u.id, u]));
    const profileMap = new Map(profiles.map(p => [p.userId, p]));
    const reactionMap = new Map(reactions.map(x => [x.postId, x._count._all]));
    const commentMap = new Map(comments.map(x => [x.postId, x._count._all]));
    readable.sort((a,b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    res.json({ posts: readable.map(p => ({
      ...p, author: userMap.get(p.authorId) ? publicProfile(profileMap.get(p.authorId) || { username: "student", bio: null, bestSubject: null, interests: [], avatarUrl: null, coverUrl: null, visibility: "PUBLIC" }, userMap.get(p.authorId)) : null,
      isSaved: true, reactionCount: reactionMap.get(p.id) || 0, commentCount: commentMap.get(p.id) || 0
    })) });
  } catch (e) { next(e); }
});

router.patch("/posts/:id", async (req, res, next) => {
  try {
    const existing = await prisma.communityPost.findFirst({ where: { id: req.params.id, authorId: req.userId } });
    if (!existing) return res.status(404).json({ error: "Post not found or you cannot edit it." });
    const data = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "body")) data.body = clean(req.body.body, 5000);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "subject")) data.subject = clean(req.body.subject, 100) || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "visibility")) {
      if (!["PUBLIC", "FOLLOWERS"].includes(req.body.visibility)) return res.status(400).json({ error: "Choose a valid post visibility." });
      data.visibility = req.body.visibility;
    }
    const nextBody = Object.prototype.hasOwnProperty.call(data, "body") ? data.body : existing.body;
    if (!nextBody && !existing.mediaUrl && !existing.videoUrl) return res.status(400).json({ error: "A post must contain text or media." });
    if (!Object.keys(data).length) return res.status(400).json({ error: "There are no changes to save." });
    const post = await prisma.communityPost.update({ where: { id: existing.id }, data });
    res.json({ post });
  } catch (e) { next(e); }
});

router.delete("/posts/:id", async (req, res, next) => {
  try {
    const post = await prisma.communityPost.findFirst({ where: { id: req.params.id, authorId: req.userId } });
    if (!post) return res.status(404).json({ error: "Post not found or you cannot delete it." });
    await prisma.$transaction([
      prisma.communityComment.deleteMany({ where: { postId: post.id } }),
      prisma.communityReaction.deleteMany({ where: { postId: post.id } }),
      prisma.communitySavedPost.deleteMany({ where: { postId: post.id } }),
      prisma.communityPost.updateMany({ where: { sharedPostId: post.id }, data: { sharedPostId: null } }),
      prisma.communityPost.delete({ where: { id: post.id } })
    ]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/posts/:id/reaction", async (req, res, next) => {
  try {
    const post = await prisma.communityPost.findUnique({ where: { id: req.params.id } });
    if (!post || !await canReadPost(post, req.userId)) return res.status(404).json({ error: "Post not found." });
    const reaction = ["LIKE", "LOVE", "HELPFUL", "INSIGHTFUL"].includes(req.body?.reaction) ? req.body.reaction : "LIKE";
    const existing = await prisma.communityReaction.findUnique({ where: { postId_userId: { postId: post.id, userId: req.userId } } });
    if (existing?.reaction === reaction) await prisma.communityReaction.delete({ where: { id: existing.id } });
    else await prisma.communityReaction.upsert({
      where: { postId_userId: { postId: post.id, userId: req.userId } },
      create: { postId: post.id, userId: req.userId, reaction },
      update: { reaction }
    });
    const count = await prisma.communityReaction.count({ where: { postId: post.id } });
    if (existing?.reaction !== reaction) await notifySocial(post.authorId, req.userId, "Someone reacted to your post", "A student reacted to one of your posts.", { type: "POST_REACTION", postId: post.id });
    res.json({ ok: true, reaction: existing?.reaction === reaction ? null : reaction, count });
  } catch (e) { next(e); }
});

router.get("/posts/:id/comments", async (req, res, next) => {
  try {
    const post = await prisma.communityPost.findUnique({ where: { id: req.params.id } });
    if (!post || !await canReadPost(post, req.userId)) return res.status(404).json({ error: "Post not found." });
    const comments = await prisma.communityComment.findMany({ where: { postId: post.id }, orderBy: { createdAt: "asc" }, take: 100 });
    const userIds = [...new Set(comments.map(c => c.userId))];
    const [users, profiles] = userIds.length ? await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      prisma.communityProfile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, username: true, avatarUrl: true } })
    ]) : [[], []];
    const userMap = new Map(users.map(u => [u.id, u]));
    const profileMap = new Map(profiles.map(p => [p.userId, p]));
    res.json({ comments: comments.map(c => ({
      ...c, authorName: userMap.get(c.userId)?.name || "Student",
      authorUsername: profileMap.get(c.userId)?.username || "student",
      avatarUrl: profileMap.get(c.userId)?.avatarUrl || null
    })) });
  } catch (e) { next(e); }
});

router.post("/posts/:id/comments", async (req, res, next) => {
  try {
    const post = await prisma.communityPost.findUnique({ where: { id: req.params.id } });
    if (!post || !await canReadPost(post, req.userId)) return res.status(404).json({ error: "Post not found." });
    const body = clean(req.body?.body, 2000);
    const parentId = clean(req.body?.parentId, 100) || null;
    if (!body) return res.status(400).json({ error: "Write a comment first." });
    if (parentId) {
      const parent = await prisma.communityComment.findFirst({ where: { id: parentId, postId: post.id, parentId: null } });
      if (!parent) return res.status(400).json({ error: "Reply to a valid top-level comment." });
    }
    const comment = await prisma.communityComment.create({ data: { postId: post.id, userId: req.userId, parentId, body } });
    await notifySocial(post.authorId, req.userId, parentId ? "New reply on your post" : "New comment on your post", "A student commented on your post.", { type: "POST_COMMENT", postId: post.id, commentId: comment.id });
    res.status(201).json({ comment });
  } catch (e) { next(e); }
});

router.get("/people", async (req, res, next) => {
  try {
    const q = clean(req.query.q, 80);
    if (q.length < 2) return res.json({ people: [] });
    const currentUser = await getUser(req.userId);
    if (!currentUser) return res.status(404).json({ error: "Account not found." });

    // Username lookup accepts both "student_name" and "@student_name".
    // Search results are limited to public, active profiles in the same education track.
    const exactUsernameSearch = q.startsWith("@");
    const usernameQuery = slug(q.replace(/^@/, ""));
    const usernameProfiles = usernameQuery.length >= 2
      ? await prisma.communityProfile.findMany({
          where: { username: exactUsernameSearch ? usernameQuery : { contains: usernameQuery }, visibility: "PUBLIC", status: "ACTIVE" },
          select: { userId: true },
          take: exactUsernameSearch ? 1 : 30
        })
      : [];
    const usernameUserIds = usernameProfiles.map(profile => profile.userId);
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.userId },
        educationTrack: currentUser.educationTrack,
        OR: exactUsernameSearch
          ? [{ id: { in: usernameUserIds } }]
          : [
              { name: { contains: q, mode: "insensitive" } },
              { institutionName: { contains: q, mode: "insensitive" } },
              ...(usernameUserIds.length ? [{ id: { in: usernameUserIds } }] : [])
            ]
      },
      select: { id: true, name: true, educationTrack: true, institutionName: true, programme: true, studyLevel: true },
      take: 20
    });
    const userIds = users.map(u => u.id);
    const [profiles, blocks, outgoing, incoming] = await Promise.all([
      prisma.communityProfile.findMany({ where: { userId: { in: userIds }, visibility: "PUBLIC", status: "ACTIVE" } }),
      prisma.communityBlock.findMany({ where: { OR: [{ blockerId: req.userId }, { blockedId: req.userId }] } }),
      prisma.communityFollow.findMany({ where: { followerId: req.userId, followingId: { in: userIds } } }),
      prisma.communityFollow.findMany({ where: { followingId: req.userId, followerId: { in: userIds } } })
    ]);
    const blockedIds = new Set(blocks.map(b => b.blockerId === req.userId ? b.blockedId : b.blockerId));
    const outMap = new Map(outgoing.map(x => [x.followingId, x.status]));
    const inMap = new Map(incoming.map(x => [x.followerId, x.status]));
    const map = new Map(profiles.map(p => [p.userId, p]));
    res.json({ people: users.filter(u => map.has(u.id) && !blockedIds.has(u.id)).map(u => ({
      ...publicProfile(map.get(u.id), u),
      friendStatus: outMap.get(u.id) === "ACCEPTED" && inMap.get(u.id) === "ACCEPTED" ? "FRIENDS" :
        inMap.get(u.id) === "PENDING" ? "REQUEST_RECEIVED" :
        outMap.get(u.id) === "PENDING" ? "REQUEST_SENT" : "NONE",
      friendRequestId: incoming.find(x => x.followerId === u.id && x.status === "PENDING")?.id || null
    })) });
  } catch (e) { next(e); }
});

router.get("/follow-requests", async (req, res, next) => {
  try {
    const requests = await prisma.communityFollow.findMany({ where: { followingId: req.userId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 50 });
    const users = await prisma.user.findMany({ where: { id: { in: requests.map(r => r.followerId) } }, select: { id: true, name: true, educationTrack: true } });
    const map = new Map(users.map(u => [u.id, u]));
    res.json({ requests: requests.map(r => ({ ...r, requester: map.get(r.followerId) || null })) });
  } catch (e) { next(e); }
});

router.get("/friends", async (req, res, next) => {
  try {
    const [outgoing, incoming] = await Promise.all([
      prisma.communityFollow.findMany({ where: { followerId: req.userId, status: "ACCEPTED" }, select: { followingId: true } }),
      prisma.communityFollow.findMany({ where: { followingId: req.userId, status: "ACCEPTED" }, select: { followerId: true } })
    ]);
    const incomingIds = new Set(incoming.map(x => x.followerId));
    const ids = outgoing.map(x => x.followingId).filter(id => incomingIds.has(id));
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, educationTrack: true, institutionName: true, programme: true, studyLevel: true } });
    const profiles = await prisma.communityProfile.findMany({ where: { userId: { in: ids } } });
    const profileMap = new Map(profiles.map(p => [p.userId, p]));
    res.json({ friends: users.filter(u => profileMap.has(u.id)).map(u => publicProfile(profileMap.get(u.id), u)) });
  } catch (e) { next(e); }
});

router.post("/friend-requests/:id", async (req, res, next) => {
  try {
    const action = req.body?.action;
    if (!["accept", "decline"].includes(action)) return res.status(400).json({ error: "Choose accept or decline." });
    const request = await prisma.communityFollow.findFirst({ where: { id: req.params.id, followingId: req.userId, status: "PENDING" } });
    if (!request) return res.status(404).json({ error: "Friend request not found or already handled." });
    const [requester, recipient] = await Promise.all([getUser(request.followerId), getUser(req.userId)]);
    if (!requester || !recipient || requester.educationTrack !== recipient.educationTrack) {
      return res.status(403).json({ error: "Friend connections are limited to students in the same academic environment." });
    }
    if (await isBlocked(req.userId, request.followerId)) return res.status(403).json({ error: "This connection is blocked." });
    if (action === "decline") {
      await prisma.communityFollow.delete({ where: { id: request.id } });
      return res.json({ ok: true, status: "DECLINED" });
    }
    await prisma.$transaction([
      prisma.communityFollow.update({ where: { id: request.id }, data: { status: "ACCEPTED" } }),
      prisma.communityFollow.upsert({
        where: { followerId_followingId: { followerId: req.userId, followingId: request.followerId } },
        create: { followerId: req.userId, followingId: request.followerId, status: "ACCEPTED" },
        update: { status: "ACCEPTED" }
      })
    ]);
    await notifySocial(request.followerId, req.userId, "Friend request accepted", "Your friend request was accepted.", { type: "FRIEND_ACCEPTED", userId: req.userId });
    res.json({ ok: true, status: "ACCEPTED" });
  } catch (e) { next(e); }
});

router.post("/follow/:userId", async (req, res, next) => {
  try {
    const [target, currentUser] = await Promise.all([getUser(req.params.userId), getUser(req.userId)]);
    if (!target || target.id === req.userId) return res.status(404).json({ error: "Student not found." });
    if (!currentUser || target.educationTrack !== currentUser.educationTrack) return res.status(403).json({ error: "Friend connections are limited to students in the same academic environment." });
    const targetProfile = await prisma.communityProfile.findUnique({ where: { userId: target.id }, select: { visibility: true, status: true } });
    if (!targetProfile || targetProfile.visibility !== "PUBLIC" || targetProfile.status !== "ACTIVE") return res.status(404).json({ error: "Student profile not found." });
    if (await isBlocked(req.userId, target.id)) return res.status(403).json({ error: "This connection is blocked." });
    const [outgoing, incoming] = await Promise.all([
      prisma.communityFollow.findUnique({ where: { followerId_followingId: { followerId: req.userId, followingId: target.id } } }),
      prisma.communityFollow.findUnique({ where: { followerId_followingId: { followerId: target.id, followingId: req.userId } } })
    ]);
    if (outgoing?.status === "ACCEPTED" && incoming?.status === "ACCEPTED") return res.json({ ok: true, status: "ACCEPTED" });
    const status = incoming?.status === "PENDING" ? "ACCEPTED" : "PENDING";
    await prisma.communityFollow.upsert({
      where: { followerId_followingId: { followerId: req.userId, followingId: target.id } },
      create: { followerId: req.userId, followingId: target.id, status },
      update: { status }
    });
    if (status === "ACCEPTED") await prisma.communityFollow.update({
      where: { followerId_followingId: { followerId: target.id, followingId: req.userId } }, data: { status: "ACCEPTED" }
    });
    if (status === "PENDING") await notifySocial(target.id, req.userId, "New friend request", "A student sent you a friend request.", { type: "FRIEND_REQUEST", requesterId: req.userId });
    else await notifySocial(target.id, req.userId, "Friend request accepted", "Your friend request was accepted.", { type: "FRIEND_ACCEPTED", userId: req.userId });
    res.json({ ok: true, status });
  } catch (e) { next(e); }
});

router.delete("/follow/:userId", async (req, res, next) => {
  try {
    const targetId = clean(req.params.userId, 100);
    if (!targetId || targetId === req.userId) return res.status(400).json({ error: "Invalid student." });
    const [outgoing, incoming] = await Promise.all([
      prisma.communityFollow.findUnique({ where: { followerId_followingId: { followerId: req.userId, followingId: targetId } } }),
      prisma.communityFollow.findUnique({ where: { followerId_followingId: { followerId: targetId, followingId: req.userId } } })
    ]);
    if (outgoing?.status === "PENDING") {
      await prisma.communityFollow.delete({ where: { id: outgoing.id } });
      return res.json({ ok: true, status: "REQUEST_CANCELLED" });
    }
    if (incoming?.status === "PENDING" && !outgoing) return res.status(409).json({ error: "This student sent you a request. Accept or decline it from Friend requests." });
    await prisma.$transaction([
      prisma.communityFollow.deleteMany({ where: { OR: [
        { followerId: req.userId, followingId: targetId },
        { followerId: targetId, followingId: req.userId }
      ] } }),
      prisma.callSession.updateMany({
        where: { status: { in: ["RINGING", "ACTIVE"] }, OR: [{ callerId: req.userId, calleeId: targetId }, { callerId: targetId, calleeId: req.userId }] },
        data: { status: "ENDED", endedAt: new Date() }
      })
    ]);
    res.json({ ok: true, status: "REMOVED" });
  } catch (e) { next(e); }
});

router.get("/groups", async (req, res, next) => {
  try {
    const myMemberships = await prisma.groupMembership.findMany({ where: { userId: req.userId, status: "ACTIVE" }, select: { groupId: true } });
    const groups = await prisma.studyGroup.findMany({
      where: { status: "ACTIVE", OR: [{ visibility: "PUBLIC" }, { id: { in: myMemberships.map(m => m.groupId) } }] },
      orderBy: { createdAt: "desc" }, take: 50
    });
    const ids = groups.map(g => g.id);
    const counts = await prisma.groupMembership.groupBy({ by: ["groupId"], where: { groupId: { in: ids }, status: "ACTIVE" }, _count: { _all: true } });
    const countMap = new Map(counts.map(x => [x.groupId, x._count._all]));
    const mine = await prisma.groupMembership.findMany({ where: { userId: req.userId, groupId: { in: ids }, status: "ACTIVE" } });
    const mineSet = new Set(mine.map(x => x.groupId));
    res.json({ groups: groups.map(g => ({ ...g, memberCount: countMap.get(g.id) || 0, joined: mineSet.has(g.id) })) });
  } catch (e) { next(e); }
});

router.post("/groups", async (req, res, next) => {
  try {
    const title = clean(req.body?.title, 100), description = clean(req.body?.description, 1000);
    if (title.length < 3 || description.length < 10) return res.status(400).json({ error: "Enter a group name and a description of at least 10 characters." });
    const user = await getUser(req.userId);
    const visibility = ["PUBLIC", "PRIVATE", "INVITE"].includes(req.body?.visibility) ? req.body.visibility : "PUBLIC";
    const crossLevel = req.body?.crossLevel === true;
    const group = await prisma.studyGroup.create({ data: { ownerId: req.userId, title, description, subject: clean(req.body?.subject, 100) || null, educationTrack: crossLevel ? null : user.educationTrack, visibility, status: crossLevel ? "PENDING" : "ACTIVE" } });
    await prisma.groupMembership.create({ data: { groupId: group.id, userId: req.userId, role: "OWNER", status: "ACTIVE" } });
    res.status(201).json({ group });
  } catch (e) { next(e); }
});

router.post("/groups/:id/join", async (req, res, next) => {
  try {
    const group = await prisma.studyGroup.findUnique({ where: { id: req.params.id } });
    if (!group || group.status !== "ACTIVE" || (group.visibility !== "PUBLIC" && group.ownerId !== req.userId)) return res.status(404).json({ error: "This group is private, awaiting moderation or unavailable." });
    const user = await getUser(req.userId);
    if (group.educationTrack && group.educationTrack !== user.educationTrack) return res.status(403).json({ error: "This group is for a different academic environment." });
    await prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: group.id, userId: req.userId } },
      create: { groupId: group.id, userId: req.userId, status: "ACTIVE" },
      update: { status: "ACTIVE" }
    });
    const existingGroupChat = await prisma.chatConversation.findFirst({ where: { groupId: group.id, kind: "GROUP" } });
    if (existingGroupChat) await prisma.chatMember.upsert({
      where: { conversationId_userId: { conversationId: existingGroupChat.id, userId: req.userId } },
      create: { conversationId: existingGroupChat.id, userId: req.userId },
      update: {}
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/groups/:id/invitations", async (req, res, next) => {
  try {
    const group = await prisma.studyGroup.findUnique({ where: { id: req.params.id } });
    if (!group || group.status !== "ACTIVE") return res.status(404).json({ error: "Study group not found." });
    const membership = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId: req.userId } } });
    if (group.ownerId !== req.userId && !["OWNER", "ADMIN", "MODERATOR"].includes(membership?.role || "")) return res.status(403).json({ error: "Only group owners and moderators can invite students." });
    const suppliedUserId = clean(req.body?.userId, 100);
    const username = slug(req.body?.username);
    const profile = !suppliedUserId && username ? await prisma.communityProfile.findUnique({ where: { username }, select: { userId: true } }) : null;
    const invited = await getUser(suppliedUserId || profile?.userId || "");
    if (!invited || invited.id === req.userId) return res.status(404).json({ error: "Student not found." });
    if (group.educationTrack && group.educationTrack !== invited.educationTrack) return res.status(403).json({ error: "This group is restricted to another academic environment." });
    if (await isBlocked(req.userId, invited.id)) return res.status(403).json({ error: "This invitation cannot be sent." });
    const invitation = await prisma.groupInvitation.upsert({
      where: { groupId_invitedUserId: { groupId: group.id, invitedUserId: invited.id } },
      create: { groupId: group.id, invitedUserId: invited.id, invitedById: req.userId },
      update: { invitedById: req.userId, status: "PENDING", updatedAt: new Date() }
    });
    res.status(201).json({ invitation });
  } catch (e) { next(e); }
});
router.get("/group-invitations", async (req, res, next) => {
  try {
    const invitations = await prisma.groupInvitation.findMany({ where: { invitedUserId: req.userId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 50 });
    const groupIds = [...new Set(invitations.map(i => i.groupId))];
    const groups = await prisma.studyGroup.findMany({ where: { id: { in: groupIds }, status: "ACTIVE" } });
    const map = new Map(groups.map(g => [g.id, g]));
    res.json({ invitations: invitations.filter(i => map.has(i.groupId)).map(i => ({ ...i, group: map.get(i.groupId) })) });
  } catch (e) { next(e); }
});
router.post("/group-invitations/:id/accept", async (req, res, next) => {
  try {
    const invitation = await prisma.groupInvitation.findFirst({ where: { id: req.params.id, invitedUserId: req.userId, status: "PENDING" } });
    if (!invitation) return res.status(404).json({ error: "Pending group invitation not found." });
    const group = await prisma.studyGroup.findUnique({ where: { id: invitation.groupId } });
    const user = await getUser(req.userId);
    if (!group || group.status !== "ACTIVE") return res.status(404).json({ error: "This group is no longer available." });
    if (group.educationTrack && group.educationTrack !== user.educationTrack) return res.status(403).json({ error: "This group is for another academic environment." });
    await prisma.$transaction(async tx => {
      await tx.groupMembership.upsert({
        where: { groupId_userId: { groupId: group.id, userId: req.userId } },
        create: { groupId: group.id, userId: req.userId, status: "ACTIVE" },
        update: { status: "ACTIVE" }
      });
      await tx.groupInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } });
      const groupChat = await tx.chatConversation.findFirst({ where: { groupId: group.id, kind: "GROUP" } });
      if (groupChat) await tx.chatMember.upsert({
        where: { conversationId_userId: { conversationId: groupChat.id, userId: req.userId } },
        create: { conversationId: groupChat.id, userId: req.userId },
        update: {}
      });
    });
    res.json({ ok: true, groupId: group.id });
  } catch (e) { next(e); }
});
router.post("/group-invitations/:id/decline", async (req, res, next) => {
  try {
    const result = await prisma.groupInvitation.updateMany({ where: { id: req.params.id, invitedUserId: req.userId, status: "PENDING" }, data: { status: "DECLINED" } });
    if (!result.count) return res.status(404).json({ error: "Pending group invitation not found." });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/videos/engagement", async (req, res, next) => {
  try {
    const videoId = clean(req.body?.videoId, 120);
    const action = clean(req.body?.action, 20).toUpperCase();
    const allowed = ["WATCH", "LIKE", "SAVE", "SKIP", "NOT_INTERESTED", "SHARE"];
    if (!videoId || !allowed.includes(action)) return res.status(400).json({ error: "Invalid video engagement." });
    const watchSeconds = Math.min(3600, Math.max(0, Number(req.body?.watchSeconds) || 0));
    const event = await prisma.videoEngagement.create({ data: {
      userId: req.userId, videoId, action, watchSeconds,
      subject: clean(req.body?.subject, 100) || null,
      provider: clean(req.body?.provider, 20).toUpperCase() || "YOUTUBE"
    }});
    res.status(201).json({ ok: true, id: event.id });
  } catch (e) { next(e); }
});

router.get("/videos/recommendations", async (req, res, next) => {
  try {
    if (!process.env.YOUTUBE_API_KEY) return res.status(503).json({ error: "Educational video recommendations require YOUTUBE_API_KEY." });
    const profile = await prisma.communityProfile.findUnique({ where: { userId: req.userId } });
    const user = await getUser(req.userId);
    const events = await prisma.videoEngagement.findMany({ where: { userId: req.userId, createdAt: { gte: new Date(Date.now() - 90 * 86400000) } }, orderBy: { createdAt: "desc" }, take: 300 });
    const scores = new Map();
    if (profile?.bestSubject) scores.set(profile.bestSubject, 10);
    for (const interest of Array.isArray(profile?.interests) ? profile.interests : []) scores.set(interest, (scores.get(interest) || 0) + 4);
    for (const event of events) {
      if (!event.subject) continue;
      const weight = event.action === "NOT_INTERESTED" ? -8 : event.action === "SKIP" ? -2 : event.action === "SAVE" ? 7 : event.action === "LIKE" ? 5 : event.action === "WATCH" ? Math.min(5, event.watchSeconds / 30) : 1;
      scores.set(event.subject, (scores.get(event.subject) || 0) + weight);
    }
    const ranked = [...scores.entries()].filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const topics = ranked.length ? ranked.map(([subject]) => subject) : [user?.educationTrack === "HIGHER" ? "university study skills" : "secondary school learning"];
    const query = topics.join(" ") + " educational lesson tutorial";
    const params = new URLSearchParams({ part: "snippet", type: "video", videoCategoryId: "27", videoEmbeddable: "true", safeSearch: "strict", maxResults: "16", order: "relevance", q: query, key: process.env.YOUTUBE_API_KEY });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("https://www.googleapis.com/youtube/v3/search?" + params.toString(), { signal: controller.signal, headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return res.status(response.status === 403 ? 503 : 502).json({ error: "The educational video provider is temporarily unavailable." });
      const seen = new Set();
      const items = (Array.isArray(data.items) ? data.items : []).filter(item => item?.id?.videoId && item?.snippet?.title && item?.snippet?.channelTitle).map(item => {
        const title = String(item.snippet.title).slice(0, 300);
        const description = String(item.snippet.description || "").slice(0, 600);
        const haystack = (title + " " + description).toLowerCase();
        const matched = ranked.map(([subject, score]) => ({ subject, score })).filter(x => haystack.includes(x.subject.toLowerCase()));
        const score = matched.reduce((sum, x) => sum + x.score, 0) || 1;
        return { id: item.id.videoId, title, channelTitle: String(item.snippet.channelTitle).slice(0, 160), description, thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || "", recommendedSubject: matched[0]?.subject || topics[0], recommendationScore: score };
      }).filter(item => /^[-_a-zA-Z0-9]{11}$/.test(item.id) && /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//.test(item.thumbnail)).filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; }).sort((a,b) => b.recommendationScore-a.recommendationScore);
      res.set("Cache-Control", "private, max-age=180");
      res.json({ items, topics, algorithm: "profile-plus-feedback-hybrid-v1" });
    } finally { clearTimeout(timeout); }
  } catch (e) { next(e); }
});

router.get("/videos/preferences", async (req, res, next) => {
  try {
    const profile = await prisma.communityProfile.findUnique({ where: { userId: req.userId } });
    const events = await prisma.videoEngagement.findMany({ where: { userId: req.userId, createdAt: { gte: new Date(Date.now() - 90 * 86400000) } }, orderBy: { createdAt: "desc" }, take: 300 });
    const scores = new Map();
    if (profile?.bestSubject) scores.set(profile.bestSubject, 8);
    for (const interest of Array.isArray(profile?.interests) ? profile.interests : []) scores.set(interest, (scores.get(interest) || 0) + 4);
    for (const event of events) {
      if (!event.subject) continue;
      const weight = event.action === "NOT_INTERESTED" ? -8 : event.action === "SKIP" ? -2 : event.action === "SAVE" ? 7 : event.action === "LIKE" ? 5 : event.action === "WATCH" ? Math.min(5, event.watchSeconds / 30) : 1;
      scores.set(event.subject, (scores.get(event.subject) || 0) + weight);
    }
    const subjects = [...scores.entries()].filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([subject, score]) => ({ subject, score: Math.round(score * 10) / 10 }));
    res.json({ subjects, educationTrack: (await getUser(req.userId))?.educationTrack || "SECONDARY", algorithm: "hybrid-profile-and-feedback-v1" });
  } catch (e) { next(e); }
});

async function canChat(userId, otherId) {
  const [a, b] = await Promise.all([getUser(userId), getUser(otherId)]);
  if (!a || !b || a.educationTrack !== b.educationTrack) return false;
  return acceptedFriend(a, b);
}
async function canAccessCall(call, userId) {
  if (!call || ![call.callerId, call.calleeId].includes(userId)) return false;
  const otherId = call.callerId === userId ? call.calleeId : call.callerId;
  return canChat(userId, otherId);
}
async function canAccessConversation(conversationId, userId) {
  const [conversation, member] = await Promise.all([
    prisma.chatConversation.findUnique({ where: { id: conversationId } }),
    prisma.chatMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } })
  ]);
  if (!conversation || !member) return false;
  if (conversation.kind === "DIRECT") {
    const other = await prisma.chatMember.findFirst({ where: { conversationId, userId: { not: userId } }, select: { userId: true } });
    return Boolean(other && await canChat(userId, other.userId));
  }
  if (conversation.kind === "GROUP" && conversation.groupId) {
    const membership = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: conversation.groupId, userId } } });
    return membership?.status === "ACTIVE";
  }
  return false;
}
router.get("/chat", async (req, res, next) => {
  try {
    const memberships = await prisma.chatMember.findMany({ where: { userId: req.userId }, orderBy: { joinedAt: "desc" }, take: 80 });
    const ids = memberships.map(m => m.conversationId);
    const allConversations = await prisma.chatConversation.findMany({ where: { id: { in: ids } }, orderBy: { updatedAt: "desc" } });
    const conversations = [];
    for (const conversation of allConversations) if (await canAccessConversation(conversation.id, req.userId)) conversations.push(conversation);
    const visibleIds = conversations.map(conversation => conversation.id);
    const messages = await prisma.chatMessage.findMany({ where: { conversationId: { in: visibleIds }, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 160 });
    const allMembers = await prisma.chatMember.findMany({ where: { conversationId: { in: visibleIds } } });
    const memberIds = [...new Set(allMembers.map(m => m.userId))];
    const memberUsers = await prisma.user.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true, educationTrack: true } });
    const memberMap = new Map(memberUsers.map(u => [u.id, u]));
    res.json({ conversations: conversations.map(c => ({ ...c, members: allMembers.filter(m => m.conversationId === c.id).map(m => ({ ...m, user: memberMap.get(m.userId) || null })), lastMessage: messages.find(m => m.conversationId === c.id) || null })) });
  } catch (e) { next(e); }
});
router.post("/chat/direct/:userId", async (req, res, next) => {
  try {
    if (!await canChat(req.userId, req.params.userId)) return res.status(403).json({ error: "Private chats are available between accepted connections in the same academic environment." });
    const conversation = await prisma.chatConversation.create({ data: { createdById: req.userId, kind: "DIRECT" } });
    await prisma.chatMember.createMany({ data: [{ conversationId: conversation.id, userId: req.userId }, { conversationId: conversation.id, userId: req.params.userId }] });
    res.status(201).json({ conversation });
  } catch (e) { next(e); }
});
router.post("/chat/group/:groupId", async (req, res, next) => {
  try {
    const group = await prisma.studyGroup.findUnique({ where: { id: req.params.groupId } });
    const member = group && await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId: req.userId } } });
    if (!member || member.status !== "ACTIVE") return res.status(403).json({ error: "Join the study group before opening its chat." });
    let conversation = await prisma.chatConversation.findFirst({ where: { groupId: group.id, kind: "GROUP" } });
    if (!conversation) {
      conversation = await prisma.chatConversation.create({ data: { createdById: group.ownerId, groupId: group.id, kind: "GROUP" } });
      const members = await prisma.groupMembership.findMany({ where: { groupId: group.id, status: "ACTIVE" }, select: { userId: true } });
      if (members.length) await prisma.chatMember.createMany({ data: members.map(m => ({ conversationId: conversation.id, userId: m.userId })), skipDuplicates: true });
    }
    res.status(201).json({ conversation });
  } catch (e) { next(e); }
});
router.get("/chat/:id/messages", async (req, res, next) => {
  try {
    if (!await canAccessConversation(req.params.id, req.userId)) return res.status(404).json({ error: "Conversation not found or connection no longer available." });
    const messages = await prisma.chatMessage.findMany({ where: { conversationId: req.params.id, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 100 });
    res.json({ messages });
  } catch (e) { next(e); }
});
router.post("/chat/:id/voice-upload-signature", async (req, res, next) => {
  try {
    if (!await canAccessConversation(req.params.id, req.userId)) return res.status(404).json({ error: "Conversation not found or connection no longer available." });
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) return res.status(503).json({ error: "Voice-note storage is not configured. Ask the administrator to configure Cloudinary." });
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "academic-tracker/chat/" + req.params.id;
    const signature = crypto.createHash("sha1").update("folder=" + folder + "&timestamp=" + timestamp + apiSecret).digest("hex");
    res.json({ cloudName, apiKey, timestamp, folder, signature, resourceType: "auto" });
  } catch (e) { next(e); }
});
router.post("/chat/:id/messages", async (req, res, next) => {
  try {
    if (!await canAccessConversation(req.params.id, req.userId)) return res.status(404).json({ error: "Conversation not found or connection no longer available." });
    const messageType = req.body?.messageType === "VOICE_NOTE" ? "VOICE_NOTE" : "TEXT";
    const body = clean(req.body?.body, 5000);
    const mediaUrl = messageType === "VOICE_NOTE" ? safeUrl(req.body?.mediaUrl) : null;
    if (messageType === "TEXT" && !body) return res.status(400).json({ error: "Message cannot be empty." });
    if (messageType === "VOICE_NOTE" && (!mediaUrl || new URL(mediaUrl).hostname !== "res.cloudinary.com")) return res.status(400).json({ error: "Voice notes must be uploaded to the configured Cloudinary media storage." });
    const message = await prisma.chatMessage.create({ data: { conversationId: req.params.id, senderId: req.userId, body: messageType === "TEXT" ? body : null, mediaUrl, messageType } });
    await prisma.chatConversation.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
    res.status(201).json({ message });
  } catch (e) { next(e); }
});
router.patch("/chat/:id/read", async (req, res, next) => {
  try {
    if (!await canAccessConversation(req.params.id, req.userId)) return res.status(404).json({ error: "Conversation not found or connection no longer available." });
    const member = await prisma.chatMember.findUnique({ where: { conversationId_userId: { conversationId: req.params.id, userId: req.userId } } });
    await prisma.chatMember.update({ where: { id: member.id }, data: { lastReadAt: new Date() } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// WebRTC signalling is persisted and polled through the API. Configure TURN_URL,
// TURN_USERNAME and TURN_CREDENTIAL in production for reliable mobile networks.
router.get("/calls/ice", (req, res) => {
  const iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];
  // Use time-limited TURN REST credentials; never expose a permanent TURN secret to browsers.
  if (process.env.TURN_URL && process.env.TURN_SHARED_SECRET) {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const username = expires + ":" + req.userId;
    const credential = crypto.createHmac("sha1", process.env.TURN_SHARED_SECRET).update(username).digest("base64");
    iceServers.push({ urls: process.env.TURN_URL.split(",").map(x => x.trim()), username, credential });
  }
  res.json({ iceServers, turnConfigured: iceServers.length > 1 });
});
router.post("/calls", async (req, res, next) => {
  try {
    const calleeId = clean(req.body?.calleeId, 100);
    if (!await canChat(req.userId, calleeId)) return res.status(403).json({ error: "Calls are available only between accepted connections in the same academic environment." });
    const active = await prisma.callSession.findFirst({ where: { status: { in: ["RINGING", "ACTIVE"] }, OR: [{ callerId: req.userId }, { calleeId: req.userId }] } });
    if (active) return res.status(409).json({ error: "You already have an incoming or outgoing call." });
    const callType = req.body?.callType === "VIDEO" ? "VIDEO" : "AUDIO";
    const call = await prisma.callSession.create({ data: { callerId: req.userId, calleeId, callType } });
    res.status(201).json({ call });
  } catch (e) { next(e); }
});
router.get("/calls/incoming", async (req, res, next) => {
  try {
    const expiredBefore = new Date(Date.now() - 90 * 1000);
    await prisma.callSession.updateMany({ where: { calleeId: req.userId, status: "RINGING", startedAt: { lt: expiredBefore } }, data: { status: "MISSED", endedAt: new Date() } });
    const calls = await prisma.callSession.findMany({ where: { calleeId: req.userId, status: "RINGING", startedAt: { gte: expiredBefore } }, orderBy: { startedAt: "desc" }, take: 10 });
    res.json({ calls });
  } catch (e) { next(e); }
});
router.post("/calls/:id/signals", async (req, res, next) => {
  try {
    const call = await prisma.callSession.findUnique({ where: { id: req.params.id } });
    if (!await canAccessCall(call, req.userId) || call.status === "ENDED" || call.status === "DECLINED") return res.status(404).json({ error: "Call not found or connection no longer available." });
    const kind = ["OFFER", "ANSWER", "ICE"].includes(req.body?.kind) ? req.body.kind : "";
    const payload = req.body?.payload;
    if (!kind || !payload || typeof payload !== "object" || JSON.stringify(payload).length > 12000) return res.status(400).json({ error: "Invalid call signal." });
    const signal = await prisma.callSignal.create({ data: { callId: call.id, senderId: req.userId, kind, payload } });
    res.status(201).json({ signalId: signal.id });
  } catch (e) { next(e); }
});
router.get("/calls/:id/signals", async (req, res, next) => {
  try {
    const call = await prisma.callSession.findUnique({ where: { id: req.params.id } });
    if (!await canAccessCall(call, req.userId)) return res.status(404).json({ error: "Call not found or connection no longer available." });
    const after = typeof req.query.after === "string" ? req.query.after : "";
    const signals = await prisma.callSignal.findMany({ where: { callId: call.id, senderId: { not: req.userId }, ...(after ? { id: { gt: after } } : {}) }, orderBy: { createdAt: "asc" }, take: 50 });
    res.json({ call, signals });
  } catch (e) { next(e); }
});
router.patch("/calls/:id", async (req, res, next) => {
  try {
    const call = await prisma.callSession.findUnique({ where: { id: req.params.id } });
    if (!await canAccessCall(call, req.userId)) return res.status(404).json({ error: "Call not found or connection no longer available." });
    const action = req.body?.action;
    const data = action === "ACCEPT" && call.calleeId === req.userId ? { status: "ACTIVE", answeredAt: new Date() }
      : action === "DECLINE" && call.calleeId === req.userId ? { status: "DECLINED", endedAt: new Date() }
      : action === "END" ? { status: "ENDED", endedAt: new Date() } : null;
    if (!data) return res.status(400).json({ error: "Invalid call action." });
    const updated = await prisma.callSession.update({ where: { id: call.id }, data });
    res.json({ call: updated });
  } catch (e) { next(e); }
});

router.post("/blocks/:userId", async (req, res, next) => {
  try {
    const targetId = clean(req.params.userId, 100);
    if (!targetId || targetId === req.userId || !await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })) return res.status(404).json({ error: "Student not found." });
    await prisma.$transaction([
      prisma.communityBlock.upsert({
        where: { blockerId_blockedId: { blockerId: req.userId, blockedId: targetId } },
        create: { blockerId: req.userId, blockedId: targetId },
        update: {}
      }),
      prisma.communityFollow.deleteMany({ where: { OR: [{ followerId: req.userId, followingId: targetId }, { followerId: targetId, followingId: req.userId }] } }),
      prisma.callSession.updateMany({
        where: { status: { in: ["RINGING", "ACTIVE"] }, OR: [{ callerId: req.userId, calleeId: targetId }, { callerId: targetId, calleeId: req.userId }] },
        data: { status: "ENDED", endedAt: new Date() }
      })
    ]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.delete("/blocks/:userId", async (req, res, next) => {
  try {
    await prisma.communityBlock.deleteMany({ where: { blockerId: req.userId, blockedId: req.params.userId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.get("/blocks", async (req, res, next) => {
  try {
    const blocks = await prisma.communityBlock.findMany({ where: { blockerId: req.userId }, orderBy: { createdAt: "desc" } });
    const ids = blocks.map(block => block.blockedId);
    const [users, profiles] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      prisma.communityProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, username: true } })
    ]);
    const userMap = new Map(users.map(user => [user.id, user]));
    const profileMap = new Map(profiles.map(profile => [profile.userId, profile]));
    res.json({ blocks: blocks.map(block => ({
      ...block, displayName: userMap.get(block.blockedId)?.name || "Student",
      username: profileMap.get(block.blockedId)?.username || ""
    })) });
  } catch (e) { next(e); }
});
router.post("/reports", async (req, res, next) => {
  try {
    const targetType = clean(req.body?.targetType, 20).toUpperCase();
    const targetId = clean(req.body?.targetId, 120);
    const reason = clean(req.body?.reason, 40).toUpperCase();
    const details = clean(req.body?.details, 1000) || null;
    const types = new Set(["USER", "POST", "COMMENT", "GROUP", "VIDEO", "MESSAGE"]);
    const reasons = new Set(["HARASSMENT", "SPAM", "INAPPROPRIATE", "MISINFORMATION", "COPYRIGHT", "OTHER"]);
    if (!types.has(targetType) || !targetId || !reasons.has(reason)) return res.status(400).json({ error: "Choose a valid report type and reason." });
    if (targetType === "USER" && !await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })) return res.status(404).json({ error: "Reported student not found." });
    if (targetType === "POST" && !await prisma.communityPost.findUnique({ where: { id: targetId }, select: { id: true } })) return res.status(404).json({ error: "Post not found." });
    if (targetType === "COMMENT" && !await prisma.communityComment.findUnique({ where: { id: targetId }, select: { id: true } })) return res.status(404).json({ error: "Comment not found." });
    if (targetType === "GROUP" && !await prisma.studyGroup.findUnique({ where: { id: targetId }, select: { id: true } })) return res.status(404).json({ error: "Group not found." });
    if (targetType === "MESSAGE") {
      const message = await prisma.chatMessage.findUnique({ where: { id: targetId }, select: { conversationId: true } });
      if (!message || !await isMember(message.conversationId, req.userId)) return res.status(404).json({ error: "Message not found." });
    }
    const report = await prisma.communityReport.create({ data: { reporterId: req.userId, targetType, targetId, reason, details } });
    res.status(201).json({ ok: true, reportId: report.id });
  } catch (e) { next(e); }
});
router.get("/admin/reports", requireAdmin, async (req, res, next) => {
  try {
    const statusFilter = ["OPEN", "RESOLVED", "DISMISSED"].includes(req.query.status) ? req.query.status : "OPEN";
    const reports = await prisma.communityReport.findMany({ where: { status: statusFilter }, orderBy: { createdAt: "asc" }, take: 100 });
    res.json({ reports });
  } catch (e) { next(e); }
});
router.patch("/admin/reports/:id", requireAdmin, async (req, res, next) => {
  try {
    const status = ["RESOLVED", "DISMISSED"].includes(req.body?.status) ? req.body.status : "";
    if (!status) return res.status(400).json({ error: "Choose RESOLVED or DISMISSED." });
    const report = await prisma.communityReport.updateMany({ where: { id: req.params.id, status: "OPEN" }, data: { status, reviewedBy: req.userId, reviewedAt: new Date() } });
    if (!report.count) return res.status(404).json({ error: "Open report not found." });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.get("/admin/groups/pending", requireAdmin, async (_req, res, next) => {
  try { res.json({ groups: await prisma.studyGroup.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100 }) }); }
  catch (e) { next(e); }
});
router.patch("/admin/groups/:id/approve", requireAdmin, async (req, res, next) => {
  try {
    const result = await prisma.studyGroup.updateMany({ where: { id: req.params.id, status: "PENDING" }, data: { status: "ACTIVE" } });
    if (!result.count) return res.status(404).json({ error: "Pending group not found." });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.get("/admin/referrals/pending", requireAdmin, async (_req, res, next) => {
  try { res.json({ referrals: await prisma.referral.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100 }) }); }
  catch (e) { next(e); }
});
router.patch("/admin/referrals/:id/approve", requireAdmin, async (req, res, next) => {
  try {
    const points = Number.isInteger(req.body?.points) ? Math.max(1, Math.min(500, req.body.points)) : 20;
    const result = await prisma.$transaction(async tx => {
      const referral = await tx.referral.findFirst({ where: { id: req.params.id, status: "PENDING" } });
      if (!referral) return null;
      await tx.referral.update({ where: { id: referral.id }, data: { status: "QUALIFIED", qualifiedAt: new Date() } });
      await tx.referralReward.create({ data: { userId: referral.inviterId, referralId: referral.id, points, rewardType: "POINTS", status: "APPROVED" } });
      return referral;
    });
    if (!result) return res.status(404).json({ error: "Pending referral not found." });
    res.json({ ok: true, points });
  } catch (e) { next(e); }
});

// Referral codes and attribution. Rewards deliberately remain pending until an
// eligibility/verification process approves them; registration alone earns nothing.
router.get("/referrals", async (req, res, next) => {
  try {
    let code = await prisma.referralCode.findUnique({ where: { userId: req.userId } });
    if (!code) {
      const generated = "AT" + crypto.randomBytes(6).toString("hex").toUpperCase();
      code = await prisma.referralCode.create({ data: { userId: req.userId, code: generated } });
    }
    const [referrals, rewards] = await Promise.all([
      prisma.referral.findMany({ where: { inviterId: req.userId }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.referralReward.aggregate({ where: { userId: req.userId, status: "APPROVED" }, _sum: { points: true } })
    ]);
    res.json({ code: code.code, inviteUrl: (process.env.PUBLIC_APP_URL || req.get("origin") || "https://academic-tracker-iota.vercel.app").replace(/\/$/, "") + "/register.html?ref=" + code.code, referrals, approvedPoints: rewards._sum.points || 0 });
  } catch (e) { next(e); }
});

module.exports = router;
