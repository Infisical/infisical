import type { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import type { TAdcsCertificateTemplate } from "@app/hooks/api/appConnections/adcs";
import type { TAzureDNSZone } from "@app/hooks/api/appConnections/azure-dns/types";
import type { TCloudflareZone } from "@app/hooks/api/appConnections/cloudflare/types";
import type {
  TDigiCertOrganization,
  TDigiCertProduct
} from "@app/hooks/api/appConnections/digicert";
import type { TDNSMadeEasyZone } from "@app/hooks/api/appConnections/dns-made-easy/types";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type {
  TGcpCloudDnsZone,
  TGcpProject,
  TListCertificateManagerResources
} from "@app/hooks/api/appConnections/gcp/types";
import type { TPowerDnsZone } from "@app/hooks/api/appConnections/powerdns/types";
import type { TUltraDNSZone } from "@app/hooks/api/appConnections/ultradns/types";
import type {
  TVenafiApplication,
  TVenafiIssuingTemplate
} from "@app/hooks/api/appConnections/venafi/types";
import type { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import type { TCaAutoRenewalConfig, TCaSigningConfig } from "@app/hooks/api/ca/queries";
import type {
  TCaCrl,
  TCaCrossSignedCertificate,
  TCaQuota,
  TCertificateAuthority,
  TCreateCertificateAuthorityDTO,
  TDeleteCaCrossSignedCertificateDTO,
  TDeleteCertificateAuthorityDTO,
  TImportCaCertificateDTO,
  TImportCaCertificateResponse,
  TImportCaCrossSignedCertificateDTO,
  TInternalCertificateAuthority,
  TRegenerateCaCrlResponse,
  TRenewCaDTO,
  TRenewCaResponse,
  TSignIntermediateDTO,
  TSignIntermediateResponse,
  TUnifiedCertificateAuthority,
  TUpdateCertificateAuthorityDTO,
  TUpdateCertificateAuthorityResponse
} from "@app/hooks/api/ca/types";
import type { TCertificateProfileWithDetails } from "@app/hooks/api/certificateProfiles/types";
import type { THsmConnector } from "@app/hooks/api/hsmConnectors/types";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import type { V4Mutation, V4QueryResult } from "../contract";

type QueryOptions = { enabled?: boolean };

export type CaPlan = Pick<
  SubscriptionPlan,
  | "caCrl"
  | "pkiOcsp"
  | "pkiPqc"
  | "pkiCrossSignedCa"
  | "pkiExternalIntermediateCa"
  | "pkiEnterpriseCaIntegrations"
  | "hsm"
  | "pkiAwsKmsSigning"
>;

export type TCaCertificateVersion = {
  certificate: string;
  certificateChain: string;
  serialNumber: string;
  version: number;
};

export type TCaCurrentCertificate = Omit<TCaCertificateVersion, "version">;

export type TInstallCaCertificateDTO = { caId: string; maxPathLength?: number };

export type TCreateCaSigningConfigDTO = {
  caId: string;
  type: string;
  parentCaId?: string;
  appConnectionId?: string;
  destinationConfig?: Record<string, unknown>;
};

export type TUpdateCaSigningConfigDTO = Omit<TCreateCaSigningConfigDTO, "type">;

export type TUpdateCaAutoRenewalDTO = {
  caId: string;
  autoRenewalEnabled?: boolean;
  autoRenewalDaysBeforeExpiry?: number;
};

export type TGenerateCaCertificateDTO = {
  caId: string;
  parentCaId?: string;
  notBefore: string;
  notAfter: string;
  maxPathLength?: number;
};

export type CertificateAuthoritiesAdapter = {
  useCasByType: (type: CaType) => V4QueryResult<TUnifiedCertificateAuthority[]>;
  useExternalCas: () => V4QueryResult<TUnifiedCertificateAuthority[]>;
  useProjectCas: (dto: {
    projectId: string;
    status?: CaStatus;
  }) => V4QueryResult<TCertificateAuthority[]>;
  useCa: (dto: {
    caId: string;
    type: CaType;
    options?: QueryOptions;
  }) => V4QueryResult<TUnifiedCertificateAuthority>;
  useInternalCa: (caId: string) => V4QueryResult<TInternalCertificateAuthority>;
  useCaCerts: (caId: string) => V4QueryResult<TCaCertificateVersion[]>;
  useCaCert: (caId: string) => V4QueryResult<TCaCurrentCertificate>;
  useCaCsr: (caId: string, maxPathLength?: number, options?: QueryOptions) => V4QueryResult<string>;
  useCaCrls: (caId: string) => V4QueryResult<TCaCrl[]>;
  useCaCrossSignedCert: (
    caId: string,
    enabled: boolean
  ) => V4QueryResult<TCaCrossSignedCertificate | null>;
  useCaSigningConfig: (
    caId: string,
    options?: QueryOptions
  ) => V4QueryResult<TCaSigningConfig | null>;
  useCaAutoRenewal: (caId: string, options?: QueryOptions) => V4QueryResult<TCaAutoRenewalConfig>;
  useCaQuota: (options?: QueryOptions) => V4QueryResult<TCaQuota>;
  useCaPlan: (orgId: string) => V4QueryResult<CaPlan>;
  useCertificateProfile: (dto: {
    profileId: string;
  }) => V4QueryResult<TCertificateProfileWithDetails>;
  useHsmConnectors: (options?: QueryOptions) => V4QueryResult<THsmConnector[]>;
  useAvailableConnections: (
    app: AppConnection,
    projectId: string,
    options?: QueryOptions
  ) => V4QueryResult<TAvailableAppConnection[]>;
  useVenafiApplications: (
    connectionId: string,
    options?: QueryOptions
  ) => V4QueryResult<TVenafiApplication[]>;
  useVenafiIssuingTemplates: (
    connectionId: string,
    applicationId: string,
    options?: QueryOptions
  ) => V4QueryResult<TVenafiIssuingTemplate[]>;
  useAzureAdcsTemplates: (connectionId: string, options?: QueryOptions) => V4QueryResult<string[]>;
  useAdcsTemplates: (
    connectionId: string,
    options?: QueryOptions
  ) => V4QueryResult<TAdcsCertificateTemplate[]>;
  useDigiCertOrganizations: (
    connectionId: string,
    options?: QueryOptions
  ) => V4QueryResult<TDigiCertOrganization[]>;
  useDigiCertProducts: (
    connectionId: string,
    options?: QueryOptions
  ) => V4QueryResult<TDigiCertProduct[]>;
  useDigiCertOrgValidation: (
    connectionId: string,
    organizationId: number,
    productNameId: string,
    options?: QueryOptions
  ) => V4QueryResult<{ isValidated: boolean }>;
  useGcpCloudDnsProjects: (
    connectionId: string,
    options?: QueryOptions
  ) => V4QueryResult<TGcpProject[]>;
  useGcpCloudDnsZones: (
    dto: TListCertificateManagerResources,
    options?: QueryOptions
  ) => V4QueryResult<TGcpCloudDnsZone[]>;
  useCloudflareZones: (
    connectionId: string,
    options?: QueryOptions
  ) => V4QueryResult<TCloudflareZone[]>;
  useDnsMadeEasyZones: (
    connectionId: string,
    options?: QueryOptions
  ) => V4QueryResult<TDNSMadeEasyZone[]>;
  useAzureDnsZones: (
    connectionId: string,
    options?: QueryOptions
  ) => V4QueryResult<TAzureDNSZone[]>;
  usePowerDnsZones: (
    connectionId: string,
    options?: QueryOptions
  ) => V4QueryResult<TPowerDnsZone[]>;
  useUltraDnsZones: (
    connectionId: string,
    options?: QueryOptions
  ) => V4QueryResult<TUltraDNSZone[]>;
  useCreateCa: V4Mutation<TCreateCertificateAuthorityDTO, TUnifiedCertificateAuthority>;
  useUpdateCa: V4Mutation<TUpdateCertificateAuthorityDTO, TUpdateCertificateAuthorityResponse>;
  useDeleteCa: V4Mutation<TDeleteCertificateAuthorityDTO, TUnifiedCertificateAuthority>;
  useSignIntermediate: V4Mutation<TSignIntermediateDTO, TSignIntermediateResponse>;
  useImportCaCertificate: V4Mutation<TImportCaCertificateDTO, TImportCaCertificateResponse>;
  useImportCaCrossSignedCert: V4Mutation<
    TImportCaCrossSignedCertificateDTO,
    TCaCrossSignedCertificate
  >;
  useDeleteCaCrossSignedCert: V4Mutation<TDeleteCaCrossSignedCertificateDTO, unknown>;
  useRenewCa: V4Mutation<TRenewCaDTO, TRenewCaResponse>;
  useRegenerateCaCrl: V4Mutation<{ caId: string }, TRegenerateCaCrlResponse>;
  useInstallCaCertificateVenafi: V4Mutation<TInstallCaCertificateDTO, unknown>;
  useInstallCaCertificateAdcs: V4Mutation<TInstallCaCertificateDTO, unknown>;
  useInstallCaCertificateAdcsNative: V4Mutation<TInstallCaCertificateDTO, unknown>;
  useCreateCaSigningConfig: V4Mutation<TCreateCaSigningConfigDTO, unknown>;
  useUpdateCaSigningConfig: V4Mutation<TUpdateCaSigningConfigDTO, unknown>;
  useUpdateCaAutoRenewal: V4Mutation<TUpdateCaAutoRenewalDTO, TCaAutoRenewalConfig>;
  useGenerateCaCertificate: V4Mutation<TGenerateCaCertificateDTO, TCaCurrentCertificate>;
};
