import { useQuery } from "@tanstack/react-query";

import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles/queries";
import { useDeleteCert, useRevokeCert } from "@app/hooks/api/certificates/mutations";
import {
  useGetCertActivityTrend,
  useGetCertDashboardStats,
  useGetCertificateById,
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

import type { CertificatesAdapter } from "./contract";

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
  useRevokeCertificate: useRevokeCert
};
