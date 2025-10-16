import { LogProvider } from "../../enums";
import { TRootProviderLogStream } from "./root-provider";

export type TAzureProviderLogStream = TRootProviderLogStream & {
  provider: LogProvider.Azure;
  credentials: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    dceUrl: string;
    dcrId: string;
    cltName: string;
  };
};
