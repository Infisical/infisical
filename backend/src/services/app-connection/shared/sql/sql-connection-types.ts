import { DiscriminativePick } from "@app/lib/types";
import { TSqlConnectionInput } from "@app/services/app-connection/app-connection-types";

export type TSqlConnectionConfig = DiscriminativePick<
  TSqlConnectionInput,
  "method" | "app" | "credentials" | "gatewayId"
> & {
  orgId: string;
};
