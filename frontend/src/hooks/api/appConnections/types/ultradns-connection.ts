import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum UltraDNSConnectionMethod {
  UsernamePassword = "username-password"
}

export enum UltraDNSEnvironment {
  Production = "production",
  Test = "test"
}

export type TUltraDNSConnection = TRootAppConnection & { app: AppConnection.UltraDNS } & {
  method: UltraDNSConnectionMethod.UsernamePassword;
  credentials: {
    username: string;
    password: string;
    environment: UltraDNSEnvironment;
  };
};
