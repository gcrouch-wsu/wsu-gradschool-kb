import { recordAuditEvent } from "@/lib/audit-log";
import type { AdminSession } from "@/lib/auth";
import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import { listUserAssignments, listUsers } from "@/lib/db-users";
import { sendEmail, type EmailSendResult } from "@/lib/email";
import { getAllKbsForAdmin, getAllPagesForAdmin } from "@/lib/kb-store";
import { logError } from "@/lib/log";
import type { KbPage, KnowledgeBase, User } from "@/lib/types";

const REVIEW_WINDOW_DAYS = 14;

export interface ReviewDigestPage {
  kbId: string;
  kbSlug: string;
  kbTitle: string;
  pageId: string;
  title: string;
  path: string[];
  nextReviewDate: string;
  ownerLabel: string;
}

interface ReviewDigestRecipient {
  user: Pick<User, "id" | "email" | "fullName" | "role">;
  pages: ReviewDigestPage[];
}

export interface ReviewDigestDelivery {
  to: string;
  sent: boolean;
  reason?: string;
  status?: number;
}

export interface ReviewDigestSummary {
  ok: true;
  pageCount: number;
  recipientCount: number;
  sentCount: number;
  skippedCount: number;
  deliveries: ReviewDigestDelivery[];
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function parseReviewDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function selectPagesDueForReview(
  knowledgeBases: KnowledgeBase[],
  pages: KbPage[],
  today = new Date(),
): ReviewDigestPage[] {
  const dueThrough = isoDate(addDays(today, REVIEW_WINDOW_DAYS));
  const kbById = new Map(knowledgeBases.map((kb) => [kb.id, kb]));

  return pages
    .flatMap((page) => {
      if (page.status === "archived") {
        return [];
      }
      const nextReviewDate = parseReviewDate(page.nextReviewDate);
      if (!nextReviewDate || page.nextReviewDate! > dueThrough) {
        return [];
      }
      const kb = kbById.get(page.kbId);
      if (!kb) {
        return [];
      }
      return [
        {
          kbId: kb.id,
          kbSlug: kb.slug,
          kbTitle: kb.title,
          pageId: page.id,
          title: page.title,
          path: page.path,
          nextReviewDate: page.nextReviewDate!,
          ownerLabel: page.ownerLabel,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.nextReviewDate.localeCompare(right.nextReviewDate) ||
        left.kbTitle.localeCompare(right.kbTitle) ||
        left.title.localeCompare(right.title),
    );
}

export async function listPagesDueForReview(today = new Date()): Promise<ReviewDigestPage[]> {
  if (!isDatabaseEnabled()) {
    const knowledgeBases = await getAllKbsForAdmin();
    const pagesByKb = await Promise.all(knowledgeBases.map((kb) => getAllPagesForAdmin(kb.id)));
    return selectPagesDueForReview(knowledgeBases, pagesByKb.flat(), today);
  }

  await ensureSchema();
  const sql = getSql();
  const dueThrough = isoDate(addDays(today, REVIEW_WINDOW_DAYS));
  const rows = (await sql`
    SELECT
      kb.id AS kb_id,
      kb.slug AS kb_slug,
      kb.title AS kb_title,
      p.id AS page_id,
      p.title AS page_title,
      p.path AS page_path,
      p.next_review_date,
      p.owner_label
    FROM kb_pages p
    JOIN knowledge_bases kb ON kb.id = p.kb_id
    WHERE p.status <> 'archived'
      AND p.next_review_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND p.next_review_date::date <= ${dueThrough}::date
    ORDER BY p.next_review_date ASC, kb.title ASC, p.title ASC
  `) as unknown as Array<{
    kb_id: string;
    kb_slug: string;
    kb_title: string;
    page_id: string;
    page_title: string;
    page_path: string;
    next_review_date: string;
    owner_label: string;
  }>;

  return rows.map((row) => ({
    kbId: row.kb_id,
    kbSlug: row.kb_slug,
    kbTitle: row.kb_title,
    pageId: row.page_id,
    title: row.page_title,
    path: row.page_path.split("/").filter(Boolean),
    nextReviewDate: row.next_review_date,
    ownerLabel: row.owner_label,
  }));
}

async function buildRecipients(pages: ReviewDigestPage[]): Promise<ReviewDigestRecipient[]> {
  if (!isDatabaseEnabled()) {
    return [];
  }

  const users = await listUsers();
  const recipients: ReviewDigestRecipient[] = [];
  for (const user of users) {
    if (user.role === "owner" || user.role === "admin") {
      recipients.push({ user, pages });
      continue;
    }
    if (user.role === "editor") {
      const assignments = new Set(await listUserAssignments(user.id));
      const assignedPages = pages.filter((page) => assignments.has(page.kbId));
      if (assignedPages.length > 0) {
        recipients.push({ user, pages: assignedPages });
      }
    }
  }
  return recipients.filter((recipient) => recipient.pages.length > 0);
}

function groupPagesByKb(pages: ReviewDigestPage[]) {
  const grouped = new Map<string, ReviewDigestPage[]>();
  for (const page of pages) {
    const key = `${page.kbTitle} (${page.kbSlug})`;
    grouped.set(key, [...(grouped.get(key) ?? []), page]);
  }
  return grouped;
}

function formatDigest(recipient: ReviewDigestRecipient) {
  const lines = [
    `Hello ${recipient.user.fullName || recipient.user.email},`,
    "",
    "The following knowledge base pages are due for review now or within 14 days.",
    "",
  ];

  for (const [kbLabel, pages] of groupPagesByKb(recipient.pages)) {
    lines.push(kbLabel);
    for (const page of pages) {
      lines.push(`- ${page.title} (${page.path.join("/")}) — next review ${page.nextReviewDate}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function deliveryFromResult(to: string, result: EmailSendResult): ReviewDigestDelivery {
  if (result.sent) {
    return { to, sent: true };
  }
  return { to, sent: false, reason: result.reason, status: result.status };
}

const systemSession: AdminSession = {
  userId: "system",
  email: "system@local",
  role: "owner",
  source: "env",
  expiresAt: Date.now() + 60_000,
  version: "system",
};

export async function sendReviewDigest(today = new Date()): Promise<ReviewDigestSummary> {
  const pages = await listPagesDueForReview(today);
  const recipients = await buildRecipients(pages);
  const deliveries: ReviewDigestDelivery[] = [];

  for (const recipient of recipients) {
    try {
      const result = await sendEmail({
        to: recipient.user.email,
        subject: "Knowledge base pages due for review",
        text: formatDigest(recipient),
      });
      deliveries.push(deliveryFromResult(recipient.user.email, result));
    } catch (error) {
      logError(error, { route: "review-digest", action: "send_email", to: recipient.user.email });
      deliveries.push({ to: recipient.user.email, sent: false, reason: "email provider error" });
    }
  }

  const sentCount = deliveries.filter((delivery) => delivery.sent).length;
  const skippedCount = deliveries.length - sentCount;
  const summary: ReviewDigestSummary = {
    ok: true,
    pageCount: pages.length,
    recipientCount: recipients.length,
    sentCount,
    skippedCount,
    deliveries,
  };

  await recordAuditEvent({
    session: systemSession,
    action: "review_digest.sent",
    entityType: "settings",
    entityId: "review-digest",
    entityLabel: "Review-date digest",
    details: {
      pageCount: summary.pageCount,
      recipientCount: summary.recipientCount,
      sentCount: summary.sentCount,
      skippedCount: summary.skippedCount,
    },
  });

  return summary;
}
