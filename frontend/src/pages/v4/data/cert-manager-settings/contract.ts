import type {
  TAppConnection,
  TCreateAppConnectionDTO,
  TDeleteAppConnectionDTO,
  TRotateAppConnectionCredentialsDTO,
  TUpdateAppConnectionDTO
} from "@app/hooks/api/appConnections/types";
import type {
  TCertificateCleanupConfig,
  TUpdateCertificateCleanupConfigDTO
} from "@app/hooks/api/certificateCleanup/types";

import type { V4Mutation, V4QueryResult } from "../contract";
import type { CertManagerAlertsAdapter } from "./contract-alerts";
import type { CertManagerHsmAdapter } from "./contract-hsm";

export type CertManagerSettingsAdapter = CertManagerHsmAdapter &
  CertManagerAlertsAdapter & {
    useConnections: (projectId: string) => V4QueryResult<TAppConnection[]>;
    useCreateConnection: V4Mutation<TCreateAppConnectionDTO, TAppConnection>;
    useUpdateConnection: V4Mutation<TUpdateAppConnectionDTO, TAppConnection>;
    useRotateConnectionCredentials: V4Mutation<TRotateAppConnectionCredentialsDTO, TAppConnection>;
    useDeleteConnection: V4Mutation<TDeleteAppConnectionDTO, TAppConnection>;
    useCleanupConfig: () => V4QueryResult<TCertificateCleanupConfig | null>;
    useUpdateCleanupConfig: V4Mutation<
      TUpdateCertificateCleanupConfigDTO,
      TCertificateCleanupConfig
    >;
  };
