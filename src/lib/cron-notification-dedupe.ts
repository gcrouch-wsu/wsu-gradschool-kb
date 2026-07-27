import { getSql } from "@/lib/db";

/** Start of the current local calendar day as an ISO string for audit-log lookups. */
export function todayStartIso(now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
}

export async function wasNotificationSentToday(action: string, entityId: string, dayStartIso: string) {
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

export async function markNotificationSent(input: {
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

/** Pure helper: should we skip sending because a same-day marker already exists? */
export function shouldSuppressDuplicateNotification(alreadySentToday: boolean) {
  return alreadySentToday;
}
