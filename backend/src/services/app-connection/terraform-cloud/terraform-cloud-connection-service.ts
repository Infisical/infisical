import { TActorContext } from "@app/domains/lib/actor-context";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import { listOrganizations as getTerraformCloudOrganizations } from "./terraform-cloud-connection-fns";
import { TTerraformCloudConnection } from "./terraform-cloud-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TTerraformCloudConnection>;

export const terraformCloudConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listOrganizations = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.TerraformCloud, connectionId, actor);
    try {
      const organizations = await getTerraformCloudOrganizations(appConnection);
      return organizations;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Terraform Cloud");
      return [];
    }
  };

  return {
    listOrganizations
  };
};
