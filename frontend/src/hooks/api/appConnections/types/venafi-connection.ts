import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum VenafiConnectionMethod {
  ApiKey = "api-key"
}

export enum VenafiRegion {
  US = "us",
  EU = "eu",
  AU = "au",
  UK = "uk",
  SG = "sg",
  CA = "ca"
}

export const VENAFI_REGION_LABELS: Record<VenafiRegion, string> = {
  [VenafiRegion.US]: "US",
  [VenafiRegion.EU]: "EU",
  [VenafiRegion.AU]: "Australia",
  [VenafiRegion.UK]: "UK",
  [VenafiRegion.SG]: "Singapore",
  [VenafiRegion.CA]: "Canada"
};

export type TVenafiConnection = TRootAppConnection & { app: AppConnection.Venafi } & {
  method: VenafiConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
    region: VenafiRegion;
  };
};
