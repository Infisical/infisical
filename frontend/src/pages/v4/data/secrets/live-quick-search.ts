import {
  fetchSecretValue,
  useGetProjectSecretsQuickSearch,
  useSearchSecretsByMetadata
} from "@app/hooks/api/dashboard/queries";

import type { SecretsQuickSearchAdapter } from "./contract-quick-search";

export const secretsQuickSearchLive: SecretsQuickSearchAdapter = {
  useQuickSearch: useGetProjectSecretsQuickSearch,
  useMetadataSearch: useSearchSecretsByMetadata,
  useReadSecretValue: () => fetchSecretValue
};
