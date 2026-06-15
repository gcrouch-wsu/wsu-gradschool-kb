import { ensureSchema, getSql } from "@/lib/db";
import type { User, UserRole } from "@/lib/types";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: string;
  created_at: string;
  updated_at: string;
}

interface AssignmentRow {
  kb_id: string;
  user_id: string;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    passwordHash: row.password_hash,
    role: row.role as UserRole,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listUsers(): Promise<User[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM users ORDER BY full_name, email
  `) as unknown as UserRow[];
  return rows.map(mapUser);
}

export async function loadUserById(id: string): Promise<User | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM users WHERE id = ${id} LIMIT 1
  `) as unknown as UserRow[];
  const row = rows[0];
  return row ? mapUser(row) : null;
}

export async function loadUserByEmail(email: string): Promise<User | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM users WHERE LOWER(email) = LOWER(${email.trim()}) LIMIT 1
  `) as unknown as UserRow[];
  const row = rows[0];
  return row ? mapUser(row) : null;
}

export async function insertUser(user: User): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO users (id, email, full_name, password_hash, role, created_at, updated_at)
    VALUES (${user.id}, ${user.email}, ${user.fullName}, ${user.passwordHash}, ${user.role}, ${user.createdAt}, ${user.updatedAt})
  `;
}

export async function updateUser(user: Partial<User> & { id: string }): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  await sql`
    UPDATE users
    SET
      email = COALESCE(${user.email ?? null}, email),
      full_name = COALESCE(${user.fullName ?? null}, full_name),
      password_hash = COALESCE(${user.passwordHash ?? null}, password_hash),
      role = COALESCE(${user.role ?? null}, role),
      updated_at = COALESCE(${user.updatedAt ?? null}, updated_at)
    WHERE id = ${user.id}
  `;
}

export async function deleteUser(id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM kb_user_assignments WHERE user_id = ${id}`;
  await sql`DELETE FROM users WHERE id = ${id}`;
}

export async function listUserAssignments(userId: string): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT kb_id FROM kb_user_assignments WHERE user_id = ${userId}
  `) as unknown as AssignmentRow[];
  return rows.map((r) => r.kb_id);
}

export async function replaceUserAssignments(userId: string, kbIds: string[]): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM kb_user_assignments WHERE user_id = ${userId}`;
  for (const kbId of kbIds) {
    await sql`
      INSERT INTO kb_user_assignments (kb_id, user_id)
      VALUES (${kbId}, ${userId})
    `;
  }
}

export async function isUserAssignedToKb(userId: string, kbId: string): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT 1 FROM kb_user_assignments WHERE user_id = ${userId} AND kb_id = ${kbId} LIMIT 1
  `) as unknown as Array<{ '1': number }>;
  return rows.length > 0;
}
