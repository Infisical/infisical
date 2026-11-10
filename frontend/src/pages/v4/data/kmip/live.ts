import {
  useCreateKmipClient,
  useDeleteKmipClients,
  useGenerateKmipClientCertificate,
  useGetKmipClientsByProjectId,
  useUpdateKmipClient
} from "@app/hooks/api/kmip";
import {
  useCreateKmipServer,
  useDeleteKmipServerById,
  useGenerateKmipServerEnrollmentToken,
  useGetKmipServerById,
  useGetKmipServers,
  useRevokeKmipServerAccess,
  useUpdateKmipServer
} from "@app/hooks/api/kmipServers";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { KmipAdapter } from "./contract";

export const kmipLive: KmipAdapter = {
  useHasKmipPlan: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return { data: data ? Boolean(data.kmip) : undefined, isPending, error };
  },
  useServers: useGetKmipServers,
  useServer: useGetKmipServerById,
  useCreateServer: useCreateKmipServer,
  useUpdateServer: useUpdateKmipServer,
  useDeleteServer: useDeleteKmipServerById,
  useGenerateEnrollmentToken: useGenerateKmipServerEnrollmentToken,
  useRevokeServerAccess: useRevokeKmipServerAccess,
  useClients: useGetKmipClientsByProjectId,
  useCreateClient: useCreateKmipClient,
  useUpdateClient: useUpdateKmipClient,
  useDeleteClient: useDeleteKmipClients,
  useGenerateClientCertificate: useGenerateKmipClientCertificate
};
