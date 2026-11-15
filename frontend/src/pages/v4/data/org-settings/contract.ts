import type {
  TCertManagerLegacyInstancesResponse,
  TExportCertManagerProjectResult
} from "@app/hooks/api/certManagerInstance";
import type {
  AddExternalKmsType,
  ExternalKmsGcpCredentialSchemaType,
  ExternalKmsProvider,
  Kms,
  KmsListEntry,
  UpdateExternalKmsType
} from "@app/hooks/api/kms/types";
import type {
  TCreateSubOrganizationDTO,
  TDeleteSubOrganizationDTO,
  TJoinSubOrganizationDTO,
  TListSubOrganizationsDTO,
  TSubOrganization,
  TUpdateSubOrganizationDTO
} from "@app/hooks/api/subOrganizations/types";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";
import type { TCreateMicrosoftTeamsIntegrationDTO } from "@app/hooks/api/workflowIntegrations/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type OrgSettingsEntitlements = Pick<
  SubscriptionPlan,
  "enforceMfa" | "externalKms" | "subOrganization"
>;

export type TExternalKmsRef = { kmsId: string; provider: ExternalKmsProvider };

export type TFetchGcpKeysDTO = { gcpRegion: string } & (
  | { credential: ExternalKmsGcpCredentialSchemaType; kmsId?: never }
  | { kmsId: string; credential?: never }
);

export type TSubOrganizationPage = { organizations: TSubOrganization[]; totalCount: number };

export type OrgSettingsAdapter = {
  useEntitlements: (orgId: string) => V4QueryResult<OrgSettingsEntitlements>;

  useExternalKmsList: (orgId: string) => V4QueryResult<KmsListEntry[]>;
  useExternalKms: (ref: TExternalKmsRef) => V4QueryResult<Kms>;
  useAddExternalKms: V4Mutation<AddExternalKmsType>;
  useUpdateExternalKms: V4Mutation<TExternalKmsRef & UpdateExternalKmsType>;
  useRemoveExternalKms: V4Mutation<TExternalKmsRef>;
  useFetchGcpKeys: V4Mutation<TFetchGcpKeysDTO, { keys: string[] }>;
  useSavedGcpKeys: (
    params: { kmsId: string; gcpRegion: string } | undefined
  ) => V4QueryResult<{ keys: string[] }>;

  useSubOrganizations: (params: TListSubOrganizationsDTO) => V4QueryResult<TSubOrganizationPage>;
  useCreateSubOrganization: V4Mutation<
    TCreateSubOrganizationDTO,
    { organization: TSubOrganization }
  >;
  useUpdateSubOrganization: V4Mutation<TUpdateSubOrganizationDTO>;
  useDeleteSubOrganization: V4Mutation<TDeleteSubOrganizationDTO>;
  useJoinSubOrganization: V4Mutation<TJoinSubOrganizationDTO>;

  useCertManagerLegacyInstances: (
    orgId: string
  ) => V4QueryResult<TCertManagerLegacyInstancesResponse>;
  useSetCertManagerActiveProject: V4Mutation<string>;
  useExportCertManagerProject: V4Mutation<
    { sourceProjectId: string },
    TExportCertManagerProjectResult
  >;
  useDeleteCertManagerProject: V4Mutation<{ projectId: string }>;

  useCreateMicrosoftTeamsIntegration: V4Mutation<TCreateMicrosoftTeamsIntegrationDTO>;
};
