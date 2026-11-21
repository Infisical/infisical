import type {
  KmipClientCertificate,
  TCreateKmipClient,
  TDeleteKmipClient,
  TGenerateKmipClientCertificate,
  TKmipClient,
  TListProjectKmipClientsDTO,
  TProjectKmipClientList,
  TUpdateKmipClient
} from "@app/hooks/api/kmip/types";
import type {
  TCreateKmipServerDTO,
  TGenerateKmipServerEnrollmentTokenDTO,
  TKmipServer,
  TKmipServerWithAuthMethod,
  TRevokeKmipServerAccessDTO,
  TUpdateKmipServerDTO
} from "@app/hooks/api/kmipServers/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type KmipEnrollment = { token: string; expiresAt: string };

export type KmipAdapter = {
  useHasKmipPlan: (orgId: string) => V4QueryResult<boolean>;
  useServers: () => V4QueryResult<TKmipServer[]>;
  useServer: (kmipServerId: string) => V4QueryResult<TKmipServerWithAuthMethod>;
  useCreateServer: V4Mutation<TCreateKmipServerDTO, TKmipServerWithAuthMethod>;
  useUpdateServer: V4Mutation<TUpdateKmipServerDTO, TKmipServerWithAuthMethod>;
  useDeleteServer: V4Mutation<string>;
  useGenerateEnrollmentToken: V4Mutation<TGenerateKmipServerEnrollmentTokenDTO, KmipEnrollment>;
  useRevokeServerAccess: V4Mutation<TRevokeKmipServerAccessDTO>;
  useClients: (dto: TListProjectKmipClientsDTO) => V4QueryResult<TProjectKmipClientList>;
  useCreateClient: V4Mutation<TCreateKmipClient, TKmipClient>;
  useUpdateClient: V4Mutation<TUpdateKmipClient, TKmipClient>;
  useDeleteClient: V4Mutation<TDeleteKmipClient>;
  useGenerateClientCertificate: V4Mutation<TGenerateKmipClientCertificate, KmipClientCertificate>;
};
