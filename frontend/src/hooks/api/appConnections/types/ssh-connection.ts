import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum SshConnectionMethod {
  Password = "password",
  SshKey = "ssh-key"
}

export type TSshConnectionConfiguration = {
  blockedUsers?: string;
};

export type TSshConnection = TRootAppConnection & {
  app: AppConnection.SSH;
  configuration?: TSshConnectionConfiguration;
} & (
    | {
        method: SshConnectionMethod.Password;
        credentials: {
          host: string;
          port?: number;
          username: string;
          password: string;
        };
      }
    | {
        method: SshConnectionMethod.SshKey;
        credentials: {
          host: string;
          port?: number;
          username: string;
          privateKey: string;
          passphrase?: string;
        };
      }
  );
