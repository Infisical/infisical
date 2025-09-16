import { LogProvider } from "../../enums";
import { TRootProviderLogStream } from "./root-provider";

export type TSplunkProviderLogStream = TRootProviderLogStream & {
  provider: LogProvider.Splunk;
  credentials: {
    hostname: string;
    token: string;
  };
};
