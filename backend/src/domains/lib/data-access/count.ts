// Postgres returns count(*) as a string (bigint), and a query with no matching group returns no row.
export const toCount = (value: string | number | null | undefined): number => Number(value ?? 0);
