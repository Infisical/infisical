import { LogProvider } from "../../enums";
import { TRootProviderLogStream } from "./root-provider";

export type TCriblProviderLogStream = TRootProviderLogStream & {
  provider: LogProvider.Cribl;
  credentials: {
    url: string;
    token: string;
  };
};
