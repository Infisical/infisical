import { useCreateIdentityProjectAdditionalPrivilege } from "@app/hooks/api/identityProjectAdditionalPrivilege/mutation";
import { useGetAvailableOrgUsers } from "@app/hooks/api/organization/queries";
import { useCreateProjectUserAdditionalPrivilege } from "@app/hooks/api/projectUserAdditionalPrivilege/mutation";

import type { SecretsAccessInsightsAdapter } from "./contract-access-insights";

export const secretsAccessInsightsLive: SecretsAccessInsightsAdapter = {
  useAvailableParentOrgUsers: useGetAvailableOrgUsers,
  useCreateUserPrivilege: useCreateProjectUserAdditionalPrivilege,
  useCreateIdentityPrivilege: useCreateIdentityProjectAdditionalPrivilege
};
