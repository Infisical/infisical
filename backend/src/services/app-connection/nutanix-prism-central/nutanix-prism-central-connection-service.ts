import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { listNutanixClusters } from "./nutanix-prism-central-connection-fns";
import {
  TNutanixPrismCentralConnection,
  TNutanixPrismCentralConnectionConfig
} from "./nutanix-prism-central-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TNutanixPrismCentralConnection>;

export const nutanixPrismCentralConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listClusters = async (
    { connectionId }: { connectionId: string },
    actor: OrgServiceActor
  ): Promise<{ id: string; name: string }[]> => {
    const appConnection = await getAppConnection(AppConnection.NutanixPrismCentral, connectionId, actor);
    return listNutanixClusters({
      ...appConnection,
      orgId: actor.orgId
    } as TNutanixPrismCentralConnectionConfig);
  };

  return { listClusters };
};
