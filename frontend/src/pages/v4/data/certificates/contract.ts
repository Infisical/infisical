import type { MongoAbility } from "@casl/ability";

import type { ProjectPermissionSet } from "@app/context/ProjectPermissionContext/types";
import type { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import type {
  TCertificateProfile,
  TListCertificateProfilesDTO
} from "@app/hooks/api/certificateProfiles/types";
import type {
  TActivityTrendResponse,
  TCertificate,
  TCertificateByIdResponse,
  TDashboardStats,
  TDeleteCertDTO,
  TPqcTrendResponse,
  TRevokeCertDTO
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
  useRevokeCertificate: V4Mutation<TRevokeCertDTO, TCertificate>;
};
