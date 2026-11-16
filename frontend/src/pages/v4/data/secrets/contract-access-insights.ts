import type { TCreateIdentityProjectPrivilegeDTO } from "@app/hooks/api/identityProjectAdditionalPrivilege/types";
import type { useGetAvailableOrgUsers } from "@app/hooks/api/organization/queries";
import type { TCreateProjectUserPrivilegeDTO } from "@app/hooks/api/projectUserAdditionalPrivilege/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type SecretsAccessInsightsAdapter = {
  useAvailableParentOrgUsers: (
    enabled: boolean
  ) => V4QueryResult<NonNullable<ReturnType<typeof useGetAvailableOrgUsers>["data"]>>;
  useCreateUserPrivilege: V4Mutation<TCreateProjectUserPrivilegeDTO>;
  useCreateIdentityPrivilege: V4Mutation<TCreateIdentityProjectPrivilegeDTO>;
};
