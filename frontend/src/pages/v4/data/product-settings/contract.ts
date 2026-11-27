import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import type { TGroupOrgMembership } from "@app/hooks/api/groups/types";
import type {
  HoneyTokenType,
  THoneyTokenConfig,
  TUpsertHoneyTokenConfigDTO
} from "@app/hooks/api/honeyToken";
import type { TSearchIdentitiesDTO } from "@app/hooks/api/identities/types";
import type {
  TCreateProjectTemplateDTO,
  TDeleteProjectTemplateDTO,
  TProjectTemplate,
  TUpdateProjectTemplateDTO
} from "@app/hooks/api/projectTemplates";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";
import type { OrgUser } from "@app/hooks/api/users/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type ProductSettingsSubscription = Pick<
  SubscriptionPlan,
  "projectTemplates" | "crossProjectSecretSharing" | "environmentLimit"
>;

export type HoneyTokenConnectionTest = {
  isConnected: boolean;
  status: string | null;
  stackName: string;
};

export type TemplateOrgUser = {
  id: string;
  user: Pick<OrgUser["user"], "username" | "email" | "firstName" | "lastName">;
};

export type TemplateOrgGroup = Pick<TGroupOrgMembership, "id" | "name" | "slug">;

export type TemplateOrgIdentity = { identity: { id: string; name: string } };

export type ProductSettingsAdapter = {
  useSubscription: (orgId: string) => V4QueryResult<ProductSettingsSubscription>;
  useProjectTemplates: (options?: { enabled?: boolean }) => V4QueryResult<TProjectTemplate[]>;
  useCreateProjectTemplate: V4Mutation<TCreateProjectTemplateDTO, TProjectTemplate>;
  useUpdateProjectTemplate: V4Mutation<TUpdateProjectTemplateDTO, TProjectTemplate>;
  useDeleteProjectTemplate: V4Mutation<TDeleteProjectTemplateDTO>;
  useHoneyTokenConfig: (type: HoneyTokenType) => V4QueryResult<THoneyTokenConfig | null>;
  useUpsertHoneyTokenConfig: V4Mutation<TUpsertHoneyTokenConfigDTO>;
  useTestHoneyTokenConnection: V4Mutation<HoneyTokenType, HoneyTokenConnectionTest>;
  useAppConnections: () => V4QueryResult<
    Pick<TAppConnection, "id" | "name" | "app" | "projectId">[]
  >;
  useOrgUsers: (orgId: string) => V4QueryResult<TemplateOrgUser[]>;
  useOrgGroups: (orgId: string) => V4QueryResult<TemplateOrgGroup[]>;
  useSearchOrgIdentities: (
    dto: TSearchIdentitiesDTO
  ) => V4QueryResult<{ identities: TemplateOrgIdentity[] }>;
};
