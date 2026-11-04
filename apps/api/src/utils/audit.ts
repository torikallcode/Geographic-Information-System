import type { Queryable } from '../db';

export interface AuditInput {
  userId: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export async function recordAudit(db: Queryable, input: AuditInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (user_id, action, object_type, object_id, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.userId, input.action, input.objectType, input.objectId ?? null, JSON.stringify(input.details ?? {}), input.ip ?? null],
  );
}
