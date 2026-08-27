import { LogProvider, SPLUNK_CLOUD_HEC_PORT, SPLUNK_ENTERPRISE_HEC_PORT } from "../../enums";
import { TRootProviderLogStream } from "./root-provider";

export type TSplunkProviderLogStream = TRootProviderLogStream & {
  provider: LogProvider.Splunk;
  credentials: {
    hostname: string;
    port?: typeof SPLUNK_ENTERPRISE_HEC_PORT | typeof SPLUNK_CLOUD_HEC_PORT;
    token: string;
  };
};
