import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listBitBucketRepositories } from "./bitbucket-connection-fns";
import { TBitBucketConnection } from "./bitbucket-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TBitBucketConnection>;

export const bitBucketConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listRepositories = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.BitBucket, connectionId, actor);

    const repositories = await listBitBucketRepositories(appConnection);

    // TODO(andrey): May need to change from slug to ID or something
    return repositories.map((repo) => ({ id: repo.slug, name: repo.full_name }));
  };

  return {
    listRepositories
  };
};
