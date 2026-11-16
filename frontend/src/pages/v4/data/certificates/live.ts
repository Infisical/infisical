import { useMutation, useQuery } from "@tanstack/react-query";
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
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles/queries";
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
  useGetCertActivityTrend,
  useGetCertDashboardStats,
  useGetCertificateById,
  useGetCertificateRenewalPreview,
  useGetCertPqcTrend
} from "@app/hooks/api/certificates/queries";
import {
  certManagerInstanceKeys,
  fetchCertManagerInstanceState
} from "@app/hooks/api/certManagerInstance";
import { useListPkiInstallations } from "@app/hooks/api/pkiDiscovery/queries";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects/queries";
import { useGetUserProjectPermissions } from "@app/hooks/api/roles/queries";
import { useListSigners, useListSigningOperations } from "@app/hooks/api/signers/queries";

import type { CertificatesAdapter, TExportCertificateDTO } from "./contract";

const useExportCertificate = () => {
  const pkcs12 = useDownloadCertPkcs12();
  const pem = useMutation({
    mutationFn: async ({ serialNumber, fileName, format }: TExportCertificateDTO) => {
      const { data } = await apiRequest.get<{ certificate: string; certificateChain: string }>(
        `/api/v1/pki/certificates/${serialNumber}/certificate`
      );
      const body =
        format === "chain"
          ? [data.certificate, data.certificateChain].map((part) => part.trim()).join("\n")
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

export const certificatesLive: CertificatesAdapter = {
  useInstanceState: (orgId) =>
    useQuery({
      queryKey: certManagerInstanceKeys.state(orgId),
      queryFn: fetchCertManagerInstanceState
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
  useRevokeCertificate: useRevokeCert,
  useRenewalPreview: useGetCertificateRenewalPreview,
  useRenewCertificate,
  useUpdateRenewalConfig,
  useImportCertificate,
  useImportPkcs12Entries,
  useIssueCertificate: useUnifiedCertificateIssuance,
  useExportCertificate,
  useUpdateCertificateMetadata: useUpdateCertificate,
  useAssignToApplication: useAssignCertificateToApplication,
  useInventoryViews: () => useListCertificateInventoryViews(),
  useCreateInventoryView: useCreateCertificateInventoryView,
  useUpdateInventoryView: useUpdateCertificateInventoryView,
  useDeleteInventoryView: useDeleteCertificateInventoryView,
  useDigiCertOrders: ({ connectionId, organizationId, productNameId, enabled }) =>
    useDigiCertConnectionListOrders(connectionId, organizationId, productNameId, { enabled })
};
