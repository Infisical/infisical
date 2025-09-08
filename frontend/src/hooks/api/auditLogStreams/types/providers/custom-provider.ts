import { LogProvider } from "../../enums";
import { TRootProviderLogStream } from "./root-provider";

export type TCustomProviderLogStream = TRootProviderLogStream & {
  provider: LogProvider.Custom;
  credentials: {
    url: string;
    headers: { key: string; value: string }[];
  };
};
