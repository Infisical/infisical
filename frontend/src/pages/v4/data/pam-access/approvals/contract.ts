import type { TAutoApprovalCatalog, TAutoApprovalOption } from "@app/hooks/api/approvalPolicies";
import type {
  TGetAutoApprovalCatalogDTO,
  TListAutoApprovalOptionsDTO
} from "@app/hooks/api/approvalPolicies/types";
import type {
  useGetPamApprovalConfig,
  useListPamAccessRequests,
  useSetPamApprovalConfig
} from "@app/hooks/api/pam";

import type { MutationOf, QueryOf } from "../../access/contract";
import type { V4QueryResult } from "../../contract";

export type PamAccessApprovalsAdapter = {
  useApprovalConfig: QueryOf<typeof useGetPamApprovalConfig>;
  useSetApprovalConfig: MutationOf<typeof useSetPamApprovalConfig>;
  useFolderAccessRequests: QueryOf<typeof useListPamAccessRequests>;
  useAutoApprovalCatalog: (
    params: TGetAutoApprovalCatalogDTO
  ) => V4QueryResult<TAutoApprovalCatalog> & {
    refetch: () => Promise<TAutoApprovalCatalog | undefined>;
  };
  useAutoApprovalOptions: (
    params: TListAutoApprovalOptionsDTO,
    enabled: boolean
  ) => V4QueryResult<TAutoApprovalOption[]>;
};
