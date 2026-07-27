import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";
import { sendEmail } from "@/lib/email";
import { listUsers, listUserAssignments } from "@/lib/db-users";
import { getSql, isDatabaseEnabled } from "@/lib/db";
import { listStaleExcerpts } from "@/lib/stale-excerpts";
import { dispatchWebhooks } from "@/lib/webhooks";
import { logError } from "@/lib/log";

const OVERDUE_NOTIFICATION_ACTION = "cron.review_overdue.notified";
const STALE_EXCERPT_NOTIFICATION_ACTION = "cron.stale_excerpt.notified";

function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) {
    return null;
  }
  const target = new Date(dateIso).getTime();
  if (!Number.isFinite(target)) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / (24 * 60 * 60 * 1000));
}

function todayStartIso() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
}

async function wasNotificationSentToday(action: string, entityId: string, dayStartIso: string) {
  const sql = getSql();
  const rows = await sql`
    SELECT 1
    FROM kb_audit_log
    WHERE action = ${action}
      AND entity_type = 'page'
      AND entity_id = ${entityId}
      AND created_at >= ${dayStartIso}::timestamptz
    LIMIT 1
  `;
  return rows.length > 0;
}

async function markNotificationSent(input: {
  action: string;
  entityId: string;
  entityLabel: string;
  kbId: string;
  details: Record<string, unknown>;
}) {
  const sql = getSql();
  await sql`
    INSERT INTO kb_audit_log (
      id, actor_email, actor_role, action, entity_type, entity_id,
      entity_label, kb_id, details, created_at
    ) VALUES (
      ${`cron-${crypto.randomUUID()}`}, 'system', 'admin', ${input.action},
      'page', ${input.entityId}, ${input.entityLabel}, ${input.kbId},
      ${JSON.stringify(input.details)}, now()
    )
  `;
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no database" });
  }

  try {
    const kbs = await getAllKbsForAdmin();
    const pages = (await Promise.all(kbs.map((kb) => getAllPagesForAdmin(kb.id)))).flat();
    const kbById = new Map(kbs.map((kb) => [kb.id, kb]));
    const users = await listUsers();
    const notificationDayStart = todayStartIso();
    const overdue = pages.filter((page) => {
      if (page.status === "archived") {
        return false;
      }
      const days = daysUntil(page.nextReviewDate);
      return days !== null && days < 0;
    });

    let notifications = 0;
    let duplicateSuppressed = 0;
    for (const page of overdue) {
      if (await wasNotificationSentToday(OVERDUE_NOTIFICATION_ACTION, page.id, notificationDayStart)) {
        duplicateSuppressed += 1;
        continue;
      }
      const kb = kbById.get(page.kbId);
      const assignee = page.reviewAssigneeEmail?.trim().toLowerCase();
      const recipients = new Set<string>();
      if (assignee) {
        recipients.add(assignee);
      }
      for (const user of users) {
        if (user.role === "owner" || user.role === "admin") {
          recipients.add(user.email.toLowerCase());
          continue;
        }
        const assignments = await listUserAssignments(user.id);
        if (assignments.includes(page.kbId) && (user.role === "manager" || user.role === "editor")) {
          recipients.add(user.email.toLowerCase());
        }
      }
      const subject = `[KB] Review overdue: ${page.title}`;
      const text = [
        `"${page.title}" (${kb?.title ?? "KB"}) is past its review date (${page.nextReviewDate}).`,
        `Assignee: ${assignee || "(none)"}`,
      ].join("\n");
      for (const email of recipients) {
        const result = await sendEmail({ to: email, subject, text });
        if (result.sent) {
          notifications += 1;
        }
      }
      await dispatchWebhooks("review.overdue", {
        pageId: page.id,
        kbId: page.kbId,
        title: page.title,
        nextReviewDate: page.nextReviewDate,
        assignee: assignee || null,
      });
      await markNotificationSent({
        action: OVERDUE_NOTIFICATION_ACTION,
        entityId: page.id,
        entityLabel: page.title,
        kbId: page.kbId,
        details: { nextReviewDate: page.nextReviewDate, assignee: assignee || null, recipients: recipients.size },
      });
    }

    const staleExcerpts = await listStaleExcerpts();
    for (const item of staleExcerpts.slice(0, 25)) {
      const staleEntityId = `${item.pageId}:${item.sourcePageId}`;
      if (await wasNotificationSentToday(STALE_EXCERPT_NOTIFICATION_ACTION, staleEntityId, notificationDayStart)) {
        duplicateSuppressed += 1;
        continue;
      }
      const kb = kbById.get(item.kbId);
      const subject = `[KB] Stale excerpt: ${item.pageTitle}`;
      const text = [
        `"${item.pageTitle}" (${kb?.title ?? "KB"}) includes an excerpt from "${item.sourceTitle}"`,
        `that was updated on ${item.sourceUpdatedDisplayDate || "unknown date"}.`,
        `Review the host page and refresh or remove the excerpt block.`,
      ].join("\n");
      for (const user of users) {
        if (user.role === "owner" || user.role === "admin") {
          await sendEmail({ to: user.email, subject, text });
        }
      }
      await dispatchWebhooks("page.draft", {
        type: "stale_excerpt",
        pageId: item.pageId,
        sourcePageId: item.sourcePageId,
        kbId: item.kbId,
      });
      await markNotificationSent({
        action: STALE_EXCERPT_NOTIFICATION_ACTION,
        entityId: staleEntityId,
        entityLabel: item.pageTitle,
        kbId: item.kbId,
        details: { pageId: item.pageId, sourcePageId: item.sourcePageId },
      });
    }

    return NextResponse.json({
      ok: true,
      overdueCount: overdue.length,
      notifications,
      staleExcerptCount: staleExcerpts.length,
      duplicateSuppressed,
    });
  } catch (error) {
    logError(error, { route: "/api/admin/cron/review-overdue" });
    return NextResponse.json({ message: "Review overdue cron failed." }, { status: 500 });
  }
}
