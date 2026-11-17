import type { MongoAbility } from "@casl/ability";

import type { ProjectPermissionSet } from "@app/context/ProjectPermissionContext/types";
import type { TDigiCertOrder } from "@app/hooks/api/appConnections/digicert/queries";
import type { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import type {
  TCertificateInventoryView,
  TCreateInventoryViewDTO,
  TDeleteInventoryViewDTO,
  TListInventoryViewsResponse,
  TUpdateInventoryViewDTO
} from "@app/hooks/api/certificateInventoryViews/types";
import type {
  TCertificateProfile,
  TListCertificateProfilesDTO
} from "@app/hooks/api/certificateProfiles/types";
import type {
  TActivityTrendResponse,
  TCertificate,
  TCertificateByIdResponse,
  TCertificateRenewalPreview,
  TDashboardStats,
  TDeleteCertDTO,
  TImportCertificateDTO,
  TImportCertificateResponse,
  TImportPkcs12EntriesDTO,
  TImportPkcs12EntriesResult,
  TPqcTrendResponse,
  TRenewCertificateDTO,
  TRenewCertificateResponse,
  TRevokeCertDTO,
  TRevokeCertResponse,
  TUnifiedCertificateIssuanceDTO,
  TUnifiedCertificateIssuanceResponse,
  TUpdateCertificateDTO,
  TUpdateRenewalConfigDTO
} from "@app/hooks/api/certificates/types";
import type { TCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import type {
  TListPkiInstallationsDTO,
  TListPkiInstallationsResponse
} from "@app/hooks/api/pkiDiscovery/types";
import type { useListWorkspaceCertificates } from "@app/hooks/api/projects/queries";
import type { TGetUserProjectPermissionDTO } from "@app/hooks/api/roles/types";
import type {
  TListSignersDTO,
  TListSignersResponse,
  TListSigningOperationsDTO,
  TListSigningOperationsResponse
} from "@app/hooks/api/signers/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TListCertificatesDTO = Parameters<typeof useListWorkspaceCertificates>[0];

export type TCertificateExportFormat = "pem" | "chain" | "pkcs12";

export type TExportCertificateDTO = {
  certificateId: string;
  serialNumber: string;
  fileName: string;
  format: TCertificateExportFormat;
  pkcs12?: { password: string; alias: string };
};

export const certificateFileName = (name: string) =>
  name.replace(/^\*\./, "wildcard.").replace(/[^a-zA-Z0-9._-]+/g, "_") || "certificate";

export type CertificatesAdapter = {
  useInstanceState: (orgId: string) => V4QueryResult<TCertManagerInstanceState>;
  useCertificates: (
    dto: TListCertificatesDTO
  ) => V4QueryResult<{ certificates: TCertificate[]; totalCount: number }>;
  useDashboardStats: (projectId: string) => V4QueryResult<TDashboardStats>;
  useActivityTrend: (projectId: string, range?: string) => V4QueryResult<TActivityTrendResponse>;
  usePqcTrend: (projectId: string, range?: string) => V4QueryResult<TPqcTrendResponse>;
  useSigners: (dto: TListSignersDTO) => V4QueryResult<TListSignersResponse>;
  useSigningOperations: (
    dto: TListSigningOperationsDTO
  ) => V4QueryResult<TListSigningOperationsResponse>;
  useProjectPermission: (dto: TGetUserProjectPermissionDTO) => V4QueryResult<{
    permission: MongoAbility<ProjectPermissionSet>;
    memberships: { roles: { role: string }[] }[];
  }>;
  useCertificate: (certificateId: string) => V4QueryResult<TCertificateByIdResponse>;
  useCertificateAuthorities: () => V4QueryResult<TUnifiedCertificateAuthority[]>;
  useCertificateProfiles: (dto: TListCertificateProfilesDTO) => V4QueryResult<{
    certificateProfiles: TCertificateProfile[];
    totalCount: number;
  }>;
  useInstallations: (dto: TListPkiInstallationsDTO) => V4QueryResult<TListPkiInstallationsResponse>;
  useDeleteCertificate: V4Mutation<TDeleteCertDTO, TCertificate>;
  useRevokeCertificate: V4Mutation<TRevokeCertDTO, TRevokeCertResponse>;
  useRenewalPreview: (certificateId: string) => V4QueryResult<TCertificateRenewalPreview>;
  useRenewCertificate: V4Mutation<TRenewCertificateDTO, TRenewCertificateResponse>;
  useUpdateRenewalConfig: V4Mutation<
    TUpdateRenewalConfigDTO,
    { message: string; renewBeforeDays?: number }
  >;
  useImportCertificate: V4Mutation<TImportCertificateDTO, TImportCertificateResponse>;
  useImportPkcs12Entries: V4Mutation<TImportPkcs12EntriesDTO, TImportPkcs12EntriesResult[]>;
  useIssueCertificate: V4Mutation<
    TUnifiedCertificateIssuanceDTO,
    TUnifiedCertificateIssuanceResponse
  >;
  useExportCertificate: V4Mutation<TExportCertificateDTO, void>;
  useUpdateCertificateMetadata: V4Mutation<
    TUpdateCertificateDTO,
    { metadata: TUpdateCertificateDTO["metadata"] }
  >;
  useAssignToApplication: V4Mutation<
    { certificateId: string; applicationId: string },
    TCertificate
  >;
  useInventoryViews: () => V4QueryResult<TListInventoryViewsResponse>;
  useCreateInventoryView: V4Mutation<TCreateInventoryViewDTO, TCertificateInventoryView>;
  useUpdateInventoryView: V4Mutation<TUpdateInventoryViewDTO, TCertificateInventoryView>;
  useDeleteInventoryView: V4Mutation<TDeleteInventoryViewDTO, TCertificateInventoryView>;
  useDigiCertOrders: (dto: {
    connectionId: string;
    organizationId: number;
    productNameId: string;
    enabled: boolean;
  }) => V4QueryResult<TDigiCertOrder[]>;
};
