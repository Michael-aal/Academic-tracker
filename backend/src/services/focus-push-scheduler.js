const webpush = require("web-push");
const { prisma } = require("../prisma");

let timer = null;
let running = false;
const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

async function deliverDueFocusSessions() {
  if (!configured() || running) return;
  running = true;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const now = Date.now();
    const active = await prisma.userDataRecord.findMany({
      where: { kind: "focus-sessions", recordId: "active" },
      take: 500
    });
    for (const record of active) {
      const session = record.data || {};
      if (session.status !== "running" || !Number.isFinite(Number(session.endsAt)) || Number(session.endsAt) > now) continue;
      const completedAt = new Date().toISOString();
      const completed = { ...session, status: "completed", remainingMs: 0, endsAt: null, completedAt, notificationSentAt: completedAt };
      await prisma.userDataRecord.update({ where: { id: record.id }, data: { data: completed } });
      const subscriptions = await prisma.userDataRecord.findMany({
        where: { userId: record.userId, kind: "push-subscriptions" },
        take: 10
      });
      const subject = typeof session.task === "string" ? session.task.slice(0, 100) : "your study session";
      const payload = JSON.stringify({
        title: "Study session completed",
        body: "Your " + subject + " focus session is up. Take a moment to review what you learned.",
        tag: "focus-" + String(session.startedAt || record.updatedAt).slice(0, 80)
      });
      for (const item of subscriptions) {
        try {
          await webpush.sendNotification(item.data, payload, { TTL: 3600 });
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            await prisma.userDataRecord.deleteMany({ where: { id: item.id } });
          } else {
            console.warn("Focus push delivery failed:", error.statusCode || error.name || "UNKNOWN");
          }
        }
      }
    }
  } catch (error) {
    console.error("Focus push scheduler failed:", error.code || error.name || "UNKNOWN");
  } finally {
    running = false;
  }
}

function startFocusPushScheduler() {
  if (timer) return;
  timer = setInterval(deliverDueFocusSessions, 15000);
  timer.unref?.();
  deliverDueFocusSessions();
}
function stopFocusPushScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
module.exports = { startFocusPushScheduler, stopFocusPushScheduler, deliverDueFocusSessions };
