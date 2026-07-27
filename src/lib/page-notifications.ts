import { isDatabaseEnabled } from "@/lib/db";
import { listUserAssignments, listUsers } from "@/lib/db-users";
import { sendEmail } from "@/lib/email";
import type { KbPage, PageStatus, User } from "@/lib/types";

async function recipientsForKb(kbId: string, roles: Array<User["role"]>): Promise<User[]> {
  if (!isDatabaseEnabled()) {
    return [];
  }
  const users = await listUsers();
  const matched: User[] = [];
  for (const user of users) {
    if (!roles.includes(user.role)) {
      continue;
    }
    if (user.role === "owner" || user.role === "admin") {
      matched.push(user);
      continue;
    }
    const assignments = await listUserAssignments(user.id);
    if (assignments.includes(kbId)) {
      matched.push(user);
    }
  }
  return matched;
}

export async function notifyPageStatusChange(input: {
  page: KbPage;
  previousStatus: PageStatus;
  nextStatus: PageStatus;
  actorEmail: string;
  kbTitle: string;
  pageUrl: string;
}): Promise<{ attempted: number; sent: number }> {
  const { page, previousStatus, nextStatus, actorEmail, kbTitle, pageUrl } = input;
  if (previousStatus === nextStatus || !isDatabaseEnabled()) {
    return { attempted: 0, sent: 0 };
  }

  let recipients: User[] = [];
  let subject = "";
  let text = "";

  if (nextStatus === "proposed" && previousStatus !== "proposed") {
    recipients = await recipientsForKb(page.kbId, ["owner", "admin"]);
    subject = `[KB] Review requested: ${page.title}`;
    text = [
      `${actorEmail} submitted "${page.title}" (${kbTitle}) for review.`,
      `Open: ${pageUrl}`,
    ].join("\n");
  } else if (nextStatus === "published" && previousStatus !== "published") {
    recipients = await recipientsForKb(page.kbId, ["owner", "admin", "editor"]);
    subject = `[KB] Published: ${page.title}`;
    text = [
      `"${page.title}" (${kbTitle}) was published by ${actorEmail}.`,
      `Open: ${pageUrl}`,
    ].join("\n");
  } else if (previousStatus === "proposed" && nextStatus === "draft") {
    recipients = await recipientsForKb(page.kbId, ["owner", "admin", "editor"]);
    subject = `[KB] Returned to draft: ${page.title}`;
    text = [
      `"${page.title}" (${kbTitle}) was returned to draft by ${actorEmail}.`,
      `Open: ${pageUrl}`,
    ].join("\n");
  } else {
    return { attempted: 0, sent: 0 };
  }

  const unique = new Map(recipients.map((user) => [user.email.toLowerCase(), user]));
  let sent = 0;
  for (const user of unique.values()) {
    const result = await sendEmail({ to: user.email, subject, text });
    if (result.sent) {
      sent += 1;
    }
  }
  return { attempted: unique.size, sent };
}
