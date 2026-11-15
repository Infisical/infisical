import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { useAdcsConnectionListCertificateTemplates } from "@app/hooks/api/appConnections/adcs";
import { useAzureAdcsConnectionListTemplates } from "@app/hooks/api/appConnections/azure-adcs";
import { useAzureDNSConnectionListZones } from "@app/hooks/api/appConnections/azure-dns";
import { useCloudflareConnectionListZones } from "@app/hooks/api/appConnections/cloudflare";
import {
  useDigiCertConnectionListOrganizations,
  useDigiCertConnectionListProducts,
  useDigiCertConnectionOrgValidation
} from "@app/hooks/api/appConnections/digicert";
import { useDNSMadeEasyConnectionListZones } from "@app/hooks/api/appConnections/dns-made-easy";
import {
  useGcpConnectionListCloudDnsProjects,
  useGcpConnectionListCloudDnsZones
} from "@app/hooks/api/appConnections/gcp/queries";
import { usePowerDnsConnectionListZones } from "@app/hooks/api/appConnections/powerdns";
import { useUltraDNSConnectionListZones } from "@app/hooks/api/appConnections/ultradns";
import {
  useVenafiConnectionListApplications,
  useVenafiConnectionListIssuingTemplates
} from "@app/hooks/api/appConnections/venafi";
import { CaRenewalStatus, CaType } from "@app/hooks/api/ca/enums";
import {
  useCreateCa,
  useCreateCaSigningConfig,
  useDeleteCa,
  useDeleteCaCrossSignedCert,
  useGenerateCaCertificate,
  useImportCaCertificate,
  useImportCaCrossSignedCert,
  useInstallCaCertificateAdcs,
  useInstallCaCertificateAdcsNative,
  useInstallCaCertificateVenafi,
  useRegenerateCaCrl,
  useRenewCa,
  useSignIntermediate,
  useUpdateCa,
  useUpdateCaAutoRenewal,
  useUpdateCaSigningConfig
} from "@app/hooks/api/ca/mutations";
import {
  caKeys,
  useGetCa,
  useGetCaAutoRenewal,
  useGetCaCert,
  useGetCaCerts,
  useGetCaCrls,
  useGetCaCrossSignedCert,
  useGetCaCsr,
  useGetCaQuota,
  useGetCaSigningConfig,
  useGetInternalCaById,
  useListCasByTypeAndProjectId,
  useListExternalCasByProjectId
} from "@app/hooks/api/ca/queries";
import { useGetCertificateProfileById } from "@app/hooks/api/certificateProfiles/queries";
import { useListHsmConnectors } from "@app/hooks/api/hsmConnectors/queries";
import { useListWorkspaceCas } from "@app/hooks/api/projects/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { CertificateAuthoritiesAdapter } from "./contract";

export const certificateAuthoritiesLive: CertificateAuthoritiesAdapter = {
  useCasByType: useListCasByTypeAndProjectId,
  useExternalCas: useListExternalCasByProjectId,
  useProjectCas: useListWorkspaceCas,
  useCa: useGetCa,
  useInternalCa: useGetInternalCaById,
  useCaCerts: useGetCaCerts,
  useCaCert: useGetCaCert,
  useCaCsr: useGetCaCsr,
  useCaCrls: useGetCaCrls,
  useCaCrossSignedCert: useGetCaCrossSignedCert,
  useCaSigningConfig: useGetCaSigningConfig,
  useCaAutoRenewal: (caId, options) => {
    const queryClient = useQueryClient();
    const result = useGetCaAutoRenewal(caId, options);
    const status = result.data?.lastRenewalStatus;
    const previous = useRef(status);
    useEffect(() => {
      const before = previous.current;
      previous.current = status;
      if (before !== CaRenewalStatus.PENDING || !status || status === CaRenewalStatus.PENDING)
        return;
      [
        caKeys.getCaById(caId),
        caKeys.getCaCerts(caId),
        caKeys.getCaCert(caId),
        caKeys.listCasByTypeAndProjectId(CaType.INTERNAL)
      ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    }, [status, caId, queryClient]);
    return result;
  },
  useCaQuota: useGetCaQuota,
  useCaPlan: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return {
      data: data && {
        caCrl: data.caCrl,
        pkiOcsp: data.pkiOcsp,
        pkiPqc: data.pkiPqc,
        pkiCrossSignedCa: data.pkiCrossSignedCa,
        pkiExternalIntermediateCa: data.pkiExternalIntermediateCa,
        pkiEnterpriseCaIntegrations: data.pkiEnterpriseCaIntegrations,
        hsm: data.hsm,
        pkiAwsKmsSigning: data.pkiAwsKmsSigning
      },
      isPending,
      error
    };
  },
  useCertificateProfile: useGetCertificateProfileById,
  useHsmConnectors: (options) => useListHsmConnectors(options),
  useAvailableConnections: useListAvailableAppConnections,
  useVenafiApplications: useVenafiConnectionListApplications,
  useVenafiIssuingTemplates: useVenafiConnectionListIssuingTemplates,
  useAzureAdcsTemplates: useAzureAdcsConnectionListTemplates,
  useAdcsTemplates: useAdcsConnectionListCertificateTemplates,
  useDigiCertOrganizations: useDigiCertConnectionListOrganizations,
  useDigiCertProducts: useDigiCertConnectionListProducts,
  useDigiCertOrgValidation: useDigiCertConnectionOrgValidation,
  useGcpCloudDnsProjects: useGcpConnectionListCloudDnsProjects,
  useGcpCloudDnsZones: useGcpConnectionListCloudDnsZones,
  useCloudflareZones: (connectionId, options) =>
    useCloudflareConnectionListZones(connectionId, options),
  useDnsMadeEasyZones: useDNSMadeEasyConnectionListZones,
  useAzureDnsZones: useAzureDNSConnectionListZones,
  usePowerDnsZones: usePowerDnsConnectionListZones,
  useUltraDnsZones: useUltraDNSConnectionListZones,
  useCreateCa,
  useUpdateCa,
  useDeleteCa,
  useSignIntermediate,
  useImportCaCertificate,
  useImportCaCrossSignedCert,
  useDeleteCaCrossSignedCert,
  useRenewCa,
  useRegenerateCaCrl,
  useInstallCaCertificateVenafi,
  useInstallCaCertificateAdcs,
  useInstallCaCertificateAdcsNative,
  useCreateCaSigningConfig,
  useUpdateCaSigningConfig,
  useUpdateCaAutoRenewal,
  useGenerateCaCertificate
};
