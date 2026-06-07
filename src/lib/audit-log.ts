import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import type { AdminSession } from "@/lib/auth";
import type { AuditEntityType, AuditLogEntry } from "@/lib/types";

interface AuditInput {
  session: AdminSession;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  kbId?: string | null;
  details?: Record<string, unknown>;
}

interface AuditFilter {
  q?: string;
  action?: string;
  entityType?: string;
  kbId?: string;
  from?: string;
  to?: string;
}

const memoryAuditLog: AuditLogEntry[] = [];

function mapAuditRow(row: {
  id: string;
  actor_email: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  kb_id?: string | null;
  details?: unknown;
  created_at: string;
}): AuditLogEntry {
  return {
    id: row.id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role as AuditLogEntry["actorRole"],
    action: row.action,
    entityType: row.entity_type as AuditEntityType,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    kbId: row.kb_id ?? null,
    details: row.details && typeof row.details === "object" ? (row.details as Record<string, unknown>) : {},
    createdAt: row.created_at,
  };
}

export async function cleanupAuditLog(): Promise<number> {
  if (!isDatabaseEnabled()) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const before = memoryAuditLog.length;
    const filtered = memoryAuditLog.filter((entry) => new Date(entry.createdAt) >= thirtyDaysAgo);
    memoryAuditLog.length = 0;
    memoryAuditLog.push(...filtered);
    return before - filtered.length;
  }

  await ensureSchema();
  const sql = getSql();
  const result = await sql`
    DELETE FROM kb_audit_log
    WHERE created_at < now() - interval '30 days'
  `;
  return result.length;
}

export async function recordSearchEvent(input: {
  query: string;
  kbId?: string | null;
  resultCount: number;
}): Promise<void> {
  const entry: AuditLogEntry = {
    id: `search-${crypto.randomUUID()}`,
    actorEmail: "public-user",
    actorRole: "editor",
    action: "search",
    entityType: "search",
    entityId: "search-query",
    entityLabel: input.query,
    kbId: input.kbId ?? null,
    details: { resultCount: input.resultCount },
    createdAt: new Date().toISOString(),
  };

  if (!isDatabaseEnabled()) {
    memoryAuditLog.unshift(entry);
    return;
  }

  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO kb_audit_log (
      id, actor_email, actor_role, action, entity_type, entity_id,
      entity_label, kb_id, details, created_at
    ) VALUES (
      ${entry.id}, ${entry.actorEmail}, ${entry.actorRole}, ${entry.action},
      ${entry.entityType}, ${entry.entityId}, ${entry.entityLabel}, ${entry.kbId ?? null},
      ${JSON.stringify(entry.details)}, ${entry.createdAt}
    )
  `;
}

export async function recordAuditEvent(input: AuditInput): Promise<void> {
  const entry: AuditLogEntry = {
    id: `audit-${crypto.randomUUID()}`,
    actorEmail: input.session.email,
    actorRole: input.session.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    kbId: input.kbId ?? null,
    details: input.details ?? {},
    createdAt: new Date().toISOString(),
  };

  if (!isDatabaseEnabled()) {
    memoryAuditLog.unshift(entry);
    return;
  }

  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO kb_audit_log (
      id, actor_email, actor_role, action, entity_type, entity_id,
      entity_label, kb_id, details, created_at
    ) VALUES (
      ${entry.id}, ${entry.actorEmail}, ${entry.actorRole}, ${entry.action},
      ${entry.entityType}, ${entry.entityId}, ${entry.entityLabel}, ${entry.kbId ?? null},
      ${JSON.stringify(entry.details)}, ${entry.createdAt}
    )
  `;
}

function matchesMemoryFilter(entry: AuditLogEntry, filter: AuditFilter) {
  const q = filter.q?.trim().toLowerCase();
  if (q) {
    const haystack = `${entry.actorEmail} ${entry.action} ${entry.entityType} ${entry.entityLabel}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (filter.action && entry.action !== filter.action) return false;
  if (filter.entityType && entry.entityType !== filter.entityType) return false;
  if (filter.kbId && entry.kbId !== filter.kbId) return false;
  if (filter.from && entry.createdAt < filter.from) return false;
  if (filter.to && entry.createdAt > `${filter.to}T23:59:59.999Z`) return false;
  return true;
}

export async function listAuditEvents(filter: AuditFilter = {}): Promise<AuditLogEntry[]> {
  if (!isDatabaseEnabled()) {
    return memoryAuditLog.filter((entry) => matchesMemoryFilter(entry, filter)).slice(0, 200);
  }

  await ensureSchema();
  const sql = getSql();
  const q = filter.q?.trim() || null;
  const rows = (await sql`
    SELECT *
    FROM kb_audit_log
    WHERE (${q}::text IS NULL OR (
      actor_email ILIKE '%' || ${q} || '%' OR
      action ILIKE '%' || ${q} || '%' OR
      entity_type ILIKE '%' || ${q} || '%' OR
      entity_label ILIKE '%' || ${q} || '%'
    ))
      AND (${filter.action || null}::text IS NULL OR action = ${filter.action || null})
      AND (${filter.entityType || null}::text IS NULL OR entity_type = ${filter.entityType || null})
      AND (${filter.kbId || null}::text IS NULL OR kb_id = ${filter.kbId || null})
      AND (${filter.from || null}::text IS NULL OR created_at >= (${filter.from || null})::timestamptz)
      AND (${filter.to || null}::text IS NULL OR created_at <= ((${filter.to || null})::date + interval '1 day'))
    ORDER BY created_at DESC
    LIMIT 200
  `) as unknown as Parameters<typeof mapAuditRow>[0][];
  return rows.map(mapAuditRow);
}
