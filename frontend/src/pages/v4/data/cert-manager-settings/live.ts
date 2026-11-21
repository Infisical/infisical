import {
  useCreateAppConnection,
  useDeleteAppConnection,
  useRotateAppConnectionCredentials,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections/mutations";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import { useUpdateCertificateCleanupConfig } from "@app/hooks/api/certificateCleanup/mutations";
import { useGetCertificateCleanupConfig } from "@app/hooks/api/certificateCleanup/queries";

import type { CertManagerSettingsAdapter } from "./contract";
import { alertsLive } from "./live-alerts";
import { hsmLive } from "./live-hsm";

export const certManagerSettingsLive: CertManagerSettingsAdapter = {
  ...hsmLive,
  ...alertsLive,
  useConnections: useListAppConnections,
  useCreateConnection: useCreateAppConnection,
  useUpdateConnection: useUpdateAppConnection,
  useRotateConnectionCredentials: useRotateAppConnectionCredentials,
  useDeleteConnection: useDeleteAppConnection,
  useCleanupConfig: useGetCertificateCleanupConfig,
  useUpdateCleanupConfig: useUpdateCertificateCleanupConfig
};
