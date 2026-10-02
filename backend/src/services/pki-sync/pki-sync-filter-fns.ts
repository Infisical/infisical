import { TPkiSyncFilters } from "./pki-sync-types";

export const PKI_SYNC_PREVIEW_PAGE_SIZE = 500;
export const PKI_SYNC_MAX_FILTER_ORDERS = 10_000;

export const PKI_SYNC_FILTER_KINDS = ["profileIds", "certificateOrderIds", "metadata"] as const;

export const hasAnyPkiSyncFilter = (filters: TPkiSyncFilters | null | undefined): boolean =>
  Boolean(filters && PKI_SYNC_FILTER_KINDS.some((kind) => filters[kind] !== undefined));

export type TPkiSyncFilterKind = (typeof PKI_SYNC_FILTER_KINDS)[number];
