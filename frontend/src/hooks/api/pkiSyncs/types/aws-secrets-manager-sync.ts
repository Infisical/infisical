import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export type TAwsSecretsManagerFieldMappings = {
  certificate: string;
  privateKey: string;
  certificateChain: string;
  caCertificate: string;
};

export type TAwsSecretsManagerPkiSync = TRootPkiSync & {
  destination: PkiSync.AwsSecretsManager;
  destinationConfig: {
    region: string;
    keyId?: string;
  };
  connection: {
    app: AppConnection.AWS;
    name: string;
    id: string;
  };
  syncOptions: TRootPkiSync["syncOptions"] & {
    fieldMappings?: TAwsSecretsManagerFieldMappings;
    preserveSecretOnRenewal?: boolean;
    updateExistingCertificates?: boolean;
  };
};
