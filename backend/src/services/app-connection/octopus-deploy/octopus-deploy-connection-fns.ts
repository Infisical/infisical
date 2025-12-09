import { Client, ClientConfiguration, userGetCurrent } from "@octopusdeploy/api-client";

import { BadRequestError } from "@app/lib/errors";

import { AppConnection } from "../app-connection-enums";
import { OctopusDeployConnectionMethod } from "./octopus-deploy-connection-enums";
import { TOctopusDeployConnectionConfig } from "./octopus-deploy-connection-types";

export const getOctopusDeployConnectionListItem = () => {
  return {
    name: "Octopus Deploy" as const,
    app: AppConnection.OctopusDeploy as const,
    methods: Object.values(OctopusDeployConnectionMethod) as [OctopusDeployConnectionMethod.ApiKey]
  };
};

export const validateOctopusDeployConnectionCredentials = async (config: TOctopusDeployConnectionConfig) => {
  const { credentials: inputCredentials } = config;
  try {
    const clientConfig: ClientConfiguration = {
      instanceURL: inputCredentials.instanceUrl,
      apiKey: inputCredentials.apiKey,
      userAgentApp: "Infisical App Connection"
    };

    const client = await Client.create(clientConfig);
    await userGetCurrent(client);
  } catch (error) {
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return inputCredentials;
};
