import { LogProvider } from "../../enums";
import { TRootProviderLogStream } from "./root-provider";

export type TQRadarProviderLogStream = TRootProviderLogStream & {
  provider: LogProvider.QRadar;
  // credentials: {};
};
