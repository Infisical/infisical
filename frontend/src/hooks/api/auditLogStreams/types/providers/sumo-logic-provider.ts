import { LogProvider } from "../../enums";
import { TRootProviderLogStream } from "./root-provider";

export type TSumoLogicProviderLogStream = TRootProviderLogStream & {
  provider: LogProvider.SumoLogic;
  credentials: {
    url: string;
    token?: string;
  };
};
