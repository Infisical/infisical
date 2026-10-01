import { AppConnection } from "@app/hooks/api/appConnections/enums";

export type TSecretScanningDataSourceBase = {
  id: string;
  name: string;
  description?: string | null;
  connectionId?: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  connection?: {
    app: AppConnection;
    id: string;
    name: string;
  } | null;
  isAutoScanEnabled: boolean;
  isDisconnected: boolean;
};
