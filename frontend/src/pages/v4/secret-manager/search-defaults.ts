export const withoutDefaults = <T extends Record<string, unknown>>(
  search: T,
  defaults: { [K in keyof T]?: T[K] }
) =>
  Object.fromEntries(
    Object.entries(search).filter(
      ([key, value]) =>
        value !== undefined && JSON.stringify(value) !== JSON.stringify(defaults[key as keyof T])
    )
  ) as T;
