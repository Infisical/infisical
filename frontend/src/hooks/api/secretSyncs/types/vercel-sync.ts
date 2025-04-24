import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export const VercelEnvironmentType = {
  Development: "development",
  Preview: "preview",
  Production: "production"
} as const;

export type VercelEnvironment = (typeof VercelEnvironmentType)[keyof typeof VercelEnvironmentType];

export type TVercelSync = TRootSecretSync & {
  destination: SecretSync.Vercel;
  destinationConfig: {
    app: string;
    env: VercelEnvironment | string;
    branch?: string;
    appName?: string;
    teamId: string;
  };
  connection: {
    app: AppConnection.Vercel;
    name: string;
    id: string;
  };
};
