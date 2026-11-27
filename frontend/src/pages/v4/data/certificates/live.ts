import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FileSaver from "file-saver";

import { apiRequest } from "@app/config/request";
import { useDigiCertConnectionListOrders } from "@app/hooks/api/appConnections/digicert/queries";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import {
  useCreateCertificateInventoryView,
  useDeleteCertificateInventoryView,
  useListCertificateInventoryViews,
  useUpdateCertificateInventoryView
} from "@app/hooks/api/certificateInventoryViews";
import {
  certificateProfileKeys,
  useListCertificateProfiles
} from "@app/hooks/api/certificateProfiles/queries";
import {
  useAssignCertificateToApplication,
  useDeleteCert,
  useDownloadCertPkcs12,
  useImportCertificate,
  useImportPkcs12Entries,
  useRenewCertificate,
  useRevokeCert,
  useUnifiedCertificateIssuance,
  useUpdateCertificate,
  useUpdateRenewalConfig
} from "@app/hooks/api/certificates/mutations";
import {
  certKeys,
  useGetCertActivityTrend,
  useGetCertBody,
  useGetCertBundle,
  useGetCertDashboardStats,
  useGetCertificateById,
  useGetCertificateRenewalPreview,
  useGetCertPqcTrend
} from "@app/hooks/api/certificates/queries";
import type { TRevokeCertDTO } from "@app/hooks/api/certificates/types";
import {
  certManagerInstanceKeys,
  fetchCertManagerInstanceState
} from "@app/hooks/api/certManagerInstance";
import { useListPkiInstallations } from "@app/hooks/api/pkiDiscovery/queries";
import { pkiSubscriberKeys } from "@app/hooks/api/pkiSubscriber/queries";
import { projectKeys } from "@app/hooks/api/projects";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects/queries";
import { useGetUserProjectPermissions } from "@app/hooks/api/roles/queries";
import { useListSigners, useListSigningOperations } from "@app/hooks/api/signers/queries";

import type { CertificatesAdapter, TExportCertificateDTO } from "./contract";

const useExportCertificate = () => {
  const pkcs12 = useDownloadCertPkcs12();
  const pem = useMutation({
    mutationFn: async ({ serialNumber, fileName, format }: TExportCertificateDTO) => {
      if (format === "key") {
        const { data: bundle } = await apiRequest.get<{ privateKey: string | null }>(
          `/api/v1/pki/certificates/${serialNumber}/bundle`
        );
        if (!bundle.privateKey) throw new Error("No private key is stored for this certificate");
        FileSaver.saveAs(
          new Blob([`${bundle.privateKey.trim()}\n`], { type: "application/x-pem-file" }),
          `${fileName}-key.pem`
        );
        return;
      }
      const { data } = await apiRequest.get<{
        certificate: string;
        certificateChain: string | null;
      }>(`/api/v1/pki/certificates/${serialNumber}/certificate`);
      const body =
        format === "chain"
          ? [data.certificate, data.certificateChain]
              .map((part) => part?.trim())
              .filter(Boolean)
              .join("\n")
          : data.certificate.trim();
      FileSaver.saveAs(
        new Blob([`${body}\n`], { type: "application/x-pem-file" }),
        `${fileName}${format === "chain" ? "-chain" : ""}.pem`
      );
    }
  });
  return {
    isPending: pkcs12.isPending || pem.isPending,
    mutateAsync: async (dto: TExportCertificateDTO) => {
      if (dto.format !== "pkcs12") return pem.mutateAsync(dto);
      if (!dto.pkcs12) throw new Error("A keystore password and alias are required");
      return pkcs12.mutateAsync({ certificateId: dto.certificateId, ...dto.pkcs12 });
    }
  };
};

const useRevokeCertificate = () => {
  const queryClient = useQueryClient();
  const revoke = useRevokeCert();
  return {
    isPending: revoke.isPending,
    mutateAsync: (dto: TRevokeCertDTO) =>
      revoke.mutateAsync(dto).catch((error: unknown) => {
        [
          certKeys.getCertificateById(dto.id),
          certificateProfileKeys.lists(),
          pkiSubscriberKeys.allPkiSubscriberCertificates(),
          projectKeys.allProjectCertificates(),
          ["cert-dashboard-stats"]
        ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
        throw error;
      })
  };
};

export const certificatesLive: CertificatesAdapter = {
  useInstanceState: (orgId, options) =>
    useQuery({
      queryKey: certManagerInstanceKeys.state(orgId),
      queryFn: fetchCertManagerInstanceState,
      enabled: options?.enabled
    }),
  useCertificates: useListWorkspaceCertificates,
  useDashboardStats: useGetCertDashboardStats,
  useActivityTrend: useGetCertActivityTrend,
  usePqcTrend: useGetCertPqcTrend,
  useSigners: useListSigners,
  useSigningOperations: useListSigningOperations,
  useProjectPermission: useGetUserProjectPermissions,
  useCertificate: useGetCertificateById,
  useCertificateAuthorities: useListCasByProjectId,
  useCertificateProfiles: useListCertificateProfiles,
  useInstallations: useListPkiInstallations,
  useDeleteCertificate: useDeleteCert,
  useRevokeCertificate,
  useRenewalPreview: useGetCertificateRenewalPreview,
  useRenewCertificate,
  useUpdateRenewalConfig,
  useImportCertificate,
  useImportPkcs12Entries,
  useIssueCertificate: useUnifiedCertificateIssuance,
  useCertificateBody: useGetCertBody,
  useCertificateBundle: useGetCertBundle,
  useExportCertificate,
  useUpdateCertificateMetadata: useUpdateCertificate,
  useAssignToApplication: useAssignCertificateToApplication,
  useInventoryViews: useListCertificateInventoryViews,
  useCreateInventoryView: useCreateCertificateInventoryView,
  useUpdateInventoryView: useUpdateCertificateInventoryView,
  useDeleteInventoryView: useDeleteCertificateInventoryView,
  useDigiCertOrders: ({ connectionId, organizationId, productNameId, enabled }) =>
    useDigiCertConnectionListOrders(connectionId, organizationId, productNameId, { enabled })
};
