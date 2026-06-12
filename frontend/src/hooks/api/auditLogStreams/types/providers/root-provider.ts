import { StreamMode } from "../../enums";

export type TRootProviderLogStream = {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  streamMode: StreamMode;
};
