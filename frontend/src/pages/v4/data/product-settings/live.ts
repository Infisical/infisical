import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useGetHoneyTokenConfig,
  useTestHoneyTokenConnection,
  useUpsertHoneyTokenConfig
} from "@app/hooks/api/honeyToken";
import { useSearchOrgIdentityMemberships } from "@app/hooks/api/identities/queries";
import { useGetOrganizationGroups } from "@app/hooks/api/organization/queries";
import {
  useCreateProjectTemplate,
  useDeleteProjectTemplate,
  useListProjectTemplates,
  useUpdateProjectTemplate
} from "@app/hooks/api/projectTemplates";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";
import { useGetOrgUsers } from "@app/hooks/api/users/queries";

import type { ProductSettingsAdapter } from "./contract";

export const productSettingsLive: ProductSettingsAdapter = {
  useSubscription: (orgId) => useGetOrgSubscription({ orgID: orgId }),
  useProjectTemplates: useListProjectTemplates,
  useCreateProjectTemplate,
  useUpdateProjectTemplate,
  useDeleteProjectTemplate,
  useHoneyTokenConfig: (type) => useGetHoneyTokenConfig(type, { retry: false }),
  useUpsertHoneyTokenConfig,
  useTestHoneyTokenConnection,
  useAppConnections: () => useListAppConnections(),
  useOrgUsers: (orgId) => useGetOrgUsers(orgId),
  useOrgGroups: useGetOrganizationGroups,
  useSearchOrgIdentities: useSearchOrgIdentityMemberships
};
