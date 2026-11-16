import type {
  DashboardSecretValue,
  TDashboardProjectSecretsQuickSearch,
  TGetDashboardProjectSecretsQuickSearchDTO,
  TGetSecretValueDTO,
  TSearchSecretsByMetadataDTO,
  TSearchSecretsByMetadataResponse
} from "@app/hooks/api/dashboard/types";

import type { V4QueryResult } from "../contract";

type SearchResult<TData> = V4QueryResult<TData> & { isFetching: boolean };

export type SecretsQuickSearchAdapter = {
  useQuickSearch: (
    dto: TGetDashboardProjectSecretsQuickSearchDTO,
    options?: { enabled?: boolean }
  ) => SearchResult<TDashboardProjectSecretsQuickSearch>;
  useMetadataSearch: (
    dto: TSearchSecretsByMetadataDTO,
    options?: { enabled?: boolean }
  ) => SearchResult<TSearchSecretsByMetadataResponse>;
  useReadSecretValue: () => (dto: TGetSecretValueDTO) => Promise<DashboardSecretValue>;
};
