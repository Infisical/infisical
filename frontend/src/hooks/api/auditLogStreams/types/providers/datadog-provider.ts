import { LogProvider } from "../../enums";
import { TRootProviderLogStream } from "./root-provider";

export type TDatadogProviderLogStream = TRootProviderLogStream & {
  provider: LogProvider.Datadog;
  credentials: {
    url: string;
    token: string;
  };
};
