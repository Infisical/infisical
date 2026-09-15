import { BadRequestError } from "@app/lib/errors";

type TStoredRow = { id: string; encryptedValue: Buffer };

/**
 * One incoming row, already validated and with its secret sealed. `encryptedValue` is undefined when the
 * caller omitted the value, which means "keep whatever is stored".
 */
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

// A shallow compare against the stored row. `encryptedValue` is only ever present here when the caller
// supplied a new value, and a re-seal of the same plaintext produces different bytes, so its presence
// always means "changed".
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
 * Resolves each incoming row to a stored one, by `id` when the caller sent one and otherwise by the row's
 * natural key (a header's name, a substitution's placeholder), both unique per service. That is what lets
 * a hand-written API call edit one row without first fetching the service for its ids.
 *
 * Ids are claimed in a first pass so that swapping two rows' names resolves the way the caller meant:
 * with one pass, the second row could claim the stored row the first had already been given by id.
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
    // A cross-service id is a 404-shaped mistake, but the caller is editing a service they can already
    // reach, so naming the row is the useful error rather than a leak.
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
      // A row nobody changed still costs a statement inside the bundle lock, and the common edit touches
      // one row out of however many the service has.
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
