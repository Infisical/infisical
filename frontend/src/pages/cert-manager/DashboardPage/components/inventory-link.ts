export type InventoryFilters = Record<string, string | undefined>;

export const getInventoryLink = (orgId: string, filters: InventoryFilters) =>
  ({
    to: "/organizations/$orgId/cert-manager/inventory",
    params: { orgId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    search: filters as any
  }) as const;

export type InventoryLink = ReturnType<typeof getInventoryLink>;
