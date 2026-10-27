import { BadRequestError } from "@app/lib/errors";

type TStoredRow = { id: string; encryptedValue: Buffer };

/** `encryptedValue` is undefined when the caller omitted the value, which means "keep whatever is stored". */
export type TTransformationWrite<TColumns> = {
  id?: string;
  naturalKey: string;
  /** The caller's own spelling, so an error quotes what they typed rather than the folded lookup key. */
  label: string;
  columns: TColumns;
  encryptedValue?: Buffer;
};

export type TTransformationPlan<TColumns> = {
  creates: (TColumns & { position: number; encryptedValue: Buffer })[];
  updates: { id: string; columns: TColumns & { position: number; encryptedValue?: Buffer } }[];
  deleteIds: string[];
};

// A re-seal of the same plaintext produces different bytes, so the presence of encryptedValue means changed.
const isUnchanged = (stored: Record<string, unknown>, columns: Record<string, unknown>) =>
  Object.entries(columns).every(([key, value]) => {
    if (key === "encryptedValue") return false;
    const current = stored[key];
    if (Array.isArray(value) && Array.isArray(current)) {
      return value.length === current.length && value.every((entry, i) => entry === current[i]);
    }
    return current === value;
  });

/**
 * Resolves each incoming row to a stored one by `id`, and otherwise by its natural key, which is what lets a
 * hand-written call edit one row without first fetching the service for its ids. Ids are claimed in a first
 * pass, or swapping two rows' names would let the second claim the row the first was already given.
 */
export const planTransformationDiff = <TRow extends TStoredRow, TColumns>({
  existing,
  incoming,
  naturalKeyOfRow,
  subject
}: {
  existing: TRow[];
  incoming: TTransformationWrite<TColumns>[];
  naturalKeyOfRow: (row: TRow) => string;
  subject: string;
}): TTransformationPlan<TColumns> => {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const claimed = new Set<string>();
  const resolved = new Array<TRow | undefined>(incoming.length);

  incoming.forEach((row, index) => {
    if (!row.id) return;
    const stored = byId.get(row.id);
    if (!stored) {
      throw new BadRequestError({ message: `No ${subject} with ID '${row.id}' belongs to this service` });
    }
    // Without this, both rows resolve to the same stored row, the second update wins, and the first row the
    // caller asked for disappears. The list-level name check cannot catch it: the two rows differ by name.
    if (claimed.has(stored.id)) {
      throw new BadRequestError({ message: `The ${subject} with ID '${row.id}' is listed twice` });
    }
    claimed.add(stored.id);
    resolved[index] = stored;
  });

  const byKey = new Map(
    existing.filter((row) => !claimed.has(row.id)).map((row) => [naturalKeyOfRow(row), row] as const)
  );

  incoming.forEach((row, index) => {
    if (resolved[index]) return;
    const stored = byKey.get(row.naturalKey);
    if (!stored) return;
    byKey.delete(row.naturalKey);
    claimed.add(stored.id);
    resolved[index] = stored;
  });

  const plan: TTransformationPlan<TColumns> = { creates: [], updates: [], deleteIds: [] };

  incoming.forEach((row, index) => {
    const stored = resolved[index];
    if (stored) {
      const columns = {
        ...row.columns,
        position: index,
        ...(row.encryptedValue ? { encryptedValue: row.encryptedValue } : {})
      };
      if (!isUnchanged(stored, columns)) plan.updates.push({ id: stored.id, columns });
      return;
    }
    if (!row.encryptedValue) {
      throw new BadRequestError({
        message: `Adding the ${subject} '${row.label}' needs a value, because there is nothing stored for it yet`
      });
    }
    plan.creates.push({ ...row.columns, position: index, encryptedValue: row.encryptedValue });
  });

  plan.deleteIds = existing.filter((row) => !claimed.has(row.id)).map((row) => row.id);

  return plan;
};
