import { accessibleKbIds, type AdminSession } from "@/lib/auth";
import {
  type AiTokenUsage,
  type AiUsageFeature,
} from "@/lib/ai-usage-core";
import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import { logError } from "@/lib/log";

export type { AiTokenUsage, AiUsageFeature } from "@/lib/ai-usage-core";
export {
  addAiTokenUsage,
  aiFeatureLabel,
  emptyAiTokenUsage,
  parseAiTokenUsage,
} from "@/lib/ai-usage-core";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Upsert daily AI usage aggregates. No-op without DATABASE_URL.
 * Privacy-light: no emails, IPs, or prompt bodies — counts and tokens only.
 */
export async function recordAiUsage(input: {
  feature: AiUsageFeature;
  model: string;
  kbId: string;
  usage: AiTokenUsage;
  day?: Date;
}): Promise<void> {
  if (!isDatabaseEnabled()) {
    return;
  }
  if (input.usage.callCount <= 0 && input.usage.totalTokens <= 0) {
    return;
  }

  await ensureSchema();
  const sql = getSql();
  const day = isoDate(input.day ?? new Date());
  const model = input.model.trim() || "unknown";
  await sql`
    INSERT INTO kb_ai_usage (
      day, feature, model, kb_id,
      call_count, prompt_tokens, completion_tokens, total_tokens
    )
    VALUES (
      ${day}::date,
      ${input.feature},
      ${model},
      ${input.kbId},
      ${input.usage.callCount},
      ${input.usage.promptTokens},
      ${input.usage.completionTokens},
      ${input.usage.totalTokens}
    )
    ON CONFLICT (day, feature, model, kb_id)
    DO UPDATE SET
      call_count = kb_ai_usage.call_count + EXCLUDED.call_count,
      prompt_tokens = kb_ai_usage.prompt_tokens + EXCLUDED.prompt_tokens,
      completion_tokens = kb_ai_usage.completion_tokens + EXCLUDED.completion_tokens,
      total_tokens = kb_ai_usage.total_tokens + EXCLUDED.total_tokens
  `;
}

export function recordAiUsageLater(input: {
  feature: AiUsageFeature;
  model: string;
  kbId: string;
  usage: AiTokenUsage;
}) {
  void recordAiUsage(input).catch((error) => {
    logError(error, {
      route: "ai-usage",
      action: "record",
      feature: input.feature,
      kbId: input.kbId,
    });
  });
}

export interface AiUsageFeatureTotal {
  feature: AiUsageFeature;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiUsageModelTotal {
  model: string;
  callCount: number;
  totalTokens: number;
}

export interface AiUsagePeriod {
  days: 7 | 30 | 90;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byFeature: AiUsageFeatureTotal[];
  byModel: AiUsageModelTotal[];
}

export interface AiUsageAnalytics {
  enabled: boolean;
  configured: boolean;
  periods: AiUsagePeriod[];
}

function normalizeCount(value: unknown) {
  return Number(value ?? 0) || 0;
}

async function getAiUsageForPeriod(
  days: 7 | 30 | 90,
  allowedKbIds: string[] | null,
): Promise<AiUsagePeriod> {
  if (allowedKbIds && allowedKbIds.length === 0) {
    return {
      days,
      callCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      byFeature: [],
      byModel: [],
    };
  }

  const sql = getSql();
  const allowed = allowedKbIds;
  const startDays = days - 1;

  const totalRows = (await sql`
    SELECT
      COALESCE(SUM(call_count), 0)::int AS call_count,
      COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
      COALESCE(SUM(total_tokens), 0)::int AS total_tokens
    FROM kb_ai_usage
    WHERE day >= current_date - (${startDays}::int * interval '1 day')
      AND (${allowed}::text[] IS NULL OR kb_id = ANY(${allowed}::text[]))
  `) as unknown as Array<{
    call_count: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }>;

  const featureRows = (await sql`
    SELECT
      feature,
      COALESCE(SUM(call_count), 0)::int AS call_count,
      COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
      COALESCE(SUM(total_tokens), 0)::int AS total_tokens
    FROM kb_ai_usage
    WHERE day >= current_date - (${startDays}::int * interval '1 day')
      AND (${allowed}::text[] IS NULL OR kb_id = ANY(${allowed}::text[]))
    GROUP BY feature
    ORDER BY total_tokens DESC, feature ASC
  `) as unknown as Array<{
    feature: string;
    call_count: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }>;

  const modelRows = (await sql`
    SELECT
      model,
      COALESCE(SUM(call_count), 0)::int AS call_count,
      COALESCE(SUM(total_tokens), 0)::int AS total_tokens
    FROM kb_ai_usage
    WHERE day >= current_date - (${startDays}::int * interval '1 day')
      AND (${allowed}::text[] IS NULL OR kb_id = ANY(${allowed}::text[]))
    GROUP BY model
    ORDER BY total_tokens DESC, model ASC
    LIMIT 10
  `) as unknown as Array<{ model: string; call_count: number; total_tokens: number }>;

  const totals = totalRows[0];
  return {
    days,
    callCount: normalizeCount(totals?.call_count),
    promptTokens: normalizeCount(totals?.prompt_tokens),
    completionTokens: normalizeCount(totals?.completion_tokens),
    totalTokens: normalizeCount(totals?.total_tokens),
    byFeature: featureRows
      .filter((row) => row.feature === "summary_draft" || row.feature === "page_review")
      .map((row) => ({
        feature: row.feature as AiUsageFeature,
        callCount: normalizeCount(row.call_count),
        promptTokens: normalizeCount(row.prompt_tokens),
        completionTokens: normalizeCount(row.completion_tokens),
        totalTokens: normalizeCount(row.total_tokens),
      })),
    byModel: modelRows.map((row) => ({
      model: row.model,
      callCount: normalizeCount(row.call_count),
      totalTokens: normalizeCount(row.total_tokens),
    })),
  };
}

export async function getAiUsageAnalyticsForSession(session: AdminSession): Promise<AiUsageAnalytics> {
  const configured = Boolean(
    (process.env.AI_PROVIDER_ENDPOINT || "").trim() &&
      (process.env.AI_API_KEY || "").trim() &&
      (process.env.AI_MODEL || "").trim(),
  );

  if (!isDatabaseEnabled()) {
    return { enabled: false, configured, periods: [] };
  }

  await ensureSchema();
  const allowedKbIds = await accessibleKbIds(session);
  return {
    enabled: true,
    configured,
    periods: await Promise.all([
      getAiUsageForPeriod(7, allowedKbIds),
      getAiUsageForPeriod(30, allowedKbIds),
      getAiUsageForPeriod(90, allowedKbIds),
    ]),
  };
}
