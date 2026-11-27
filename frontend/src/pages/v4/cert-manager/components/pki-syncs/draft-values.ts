export type PkiSyncFieldName = string;

export type PkiSyncErrors = Record<string, string | undefined>;

export const valueAt = (values: unknown, name: PkiSyncFieldName): unknown =>
  name
    .split(".")
    .reduce<unknown>(
      (current, key) => (current as Record<string, unknown> | undefined)?.[key],
      values
    );

export const withValueAt = (values: unknown, keys: string[], value: unknown): unknown => {
  const [key, ...rest] = keys;
  const container = (
    Array.isArray(values) ? [...values] : { ...(values as Record<string, unknown> | undefined) }
  ) as Record<string, unknown>;
  container[key] = rest.length ? withValueAt(container[key], rest, value) : value;
  return container;
};

export const withoutErrorsAt = (errors: PkiSyncErrors, name: PkiSyncFieldName) => {
  const isStale = (key: string) =>
    key === name || key.startsWith(`${name}.`) || name.startsWith(`${key}.`);
  if (!Object.keys(errors).some((key) => errors[key] && isStale(key))) return errors;
  return Object.fromEntries(Object.entries(errors).filter(([key]) => !isStale(key)));
};

type SafeParseSchema = {
  safeParse: (value: unknown) => {
    success: boolean;
    error?: { issues: { path: PropertyKey[]; message: string }[] };
  };
};

export const schemaErrors = (
  schema: SafeParseSchema,
  values: unknown,
  names?: PkiSyncFieldName[]
): PkiSyncErrors => {
  const result = schema.safeParse(values);
  if (result.success || !result.error) return {};
  const errors: PkiSyncErrors = {};
  result.error.issues.forEach((issue) => {
    const path = issue.path.map(String).join(".");
    if (names && !names.some((name) => path === name || path.startsWith(`${name}.`))) return;
    errors[path] ??= issue.message;
  });
  return errors;
};

export const hasErrors = (errors: PkiSyncErrors) => Object.values(errors).some(Boolean);
