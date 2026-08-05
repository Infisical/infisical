import { Knex } from "knex";

const DEFAULT_BATCH_SIZE = 500;

/**
 * Rewrites a JSON column in keyset-paginated batches. Prefer a set-based UPDATE when the transform can
 * be expressed in SQL. `rewrite` returns the new value for a row, or undefined to skip it. Requires a
 * unique, sortable `id` column.
 */
export const rewriteJsonColumnInBatches = async <TValue>({
  knex,
  table,
  column,
  rewrite,
  narrow,
  batchSize = DEFAULT_BATCH_SIZE
}: {
  knex: Knex;
  table: string;
  column: string;
  rewrite: (value: TValue, row: { id: string }) => TValue | undefined;
  narrow?: (query: Knex.QueryBuilder) => void;
  batchSize?: number;
}): Promise<number> => {
  let cursor: string | null = null;
  let rewrittenCount = 0;

  for (;;) {
    const query = knex(table).select("id", column).orderBy("id", "asc").limit(batchSize);
    if (narrow) narrow(query);
    if (cursor) void query.where("id", ">", cursor);

    // eslint-disable-next-line no-await-in-loop
    const rows = (await query) as ({ id: string } & Record<string, TValue>)[];
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    const updates: { id: string; value: TValue }[] = [];
    for (const row of rows) {
      const rewritten = rewrite(row[column], row);
      if (rewritten !== undefined) updates.push({ id: row.id, value: rewritten });
    }

    if (updates.length > 0) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        updates.map((update) =>
          knex(table)
            .where({ id: update.id })
            .update({ [column]: JSON.stringify(update.value) })
        )
      );
      rewrittenCount += updates.length;
    }

    if (rows.length < batchSize) break;
  }

  return rewrittenCount;
};
