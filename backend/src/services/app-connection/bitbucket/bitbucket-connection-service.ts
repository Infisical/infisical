import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
// import { listBitBucketVaults } from "./bitbucket-connection-fns";
import { TBitBucketConnection } from "./bitbucket-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TBitBucketConnection>;

export const bitBucketConnectionService = (_getAppConnection: TGetAppConnectionFunc) => {
  return {};
};
