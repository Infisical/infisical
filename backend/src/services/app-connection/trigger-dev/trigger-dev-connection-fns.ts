import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { TriggerDevConnectionMethod } from "./trigger-dev-connection-enums";
import {
  TTriggerDevConnection,
  TTriggerDevConnectionConfig,
  TTriggerDevEnvironment,
  TTriggerDevProject
} from "./trigger-dev-connection-types";

type TTriggerDevApiEnvironment = {
  id: string;
  slug: string;
  type: string;
};

type TTriggerDevApiProject = {
  id: string;
  externalRef: string;
  name: string;
  slug: string;
  organization: {
    id: string;
    title: string;
    slug: string;
  };
};

export const getTriggerDevInstanceUrl = async (
  config: Pick<TTriggerDevConnectionConfig | TTriggerDevConnection, "credentials">
) => {
  const instanceUrl = config.credentials.instanceUrl
    ? removeTrailingSlash(config.credentials.instanceUrl)
    : IntegrationUrls.TRIGGER_DEV_API_URL;

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const getTriggerDevConnectionListItem = () => {
  return {
    name: "Trigger.dev" as const,
    app: AppConnection.TriggerDev as const,
    methods: Object.values(TriggerDevConnectionMethod) as [TriggerDevConnectionMethod.ApiKey]
  };
};

export const validateTriggerDevConnectionCredentials = async (config: TTriggerDevConnectionConfig) => {
  const instanceUrl = await getTriggerDevInstanceUrl(config);
  const { apiKey } = config.credentials;

  try {
    await request.get(`${instanceUrl}/api/v1/projects`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return config.credentials;
};

export const listTriggerDevProjects = async (appConnection: TTriggerDevConnection): Promise<TTriggerDevProject[]> => {
  const instanceUrl = await getTriggerDevInstanceUrl(appConnection);
  const { apiKey } = appConnection.credentials;

  const { data } = await request.get<TTriggerDevApiProject[]>(`${instanceUrl}/api/v1/projects`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  });

  // externalRef (proj_...) is the project reference used by the env-vars API, so use it as the value.
  // The PAT can span multiple organizations, so include the org (with slug) to disambiguate
  // identically-named projects and organizations.
  return data.map((project) => ({
    id: project.externalRef,
    name: project.name,
    organization: {
      id: project.organization.id,
      name: project.organization.title,
      slug: project.organization.slug
    }
  }));
};

export const listTriggerDevEnvironments = async (
  appConnection: TTriggerDevConnection,
  projectRef: string
): Promise<TTriggerDevEnvironment[]> => {
  const instanceUrl = await getTriggerDevInstanceUrl(appConnection);
  const { apiKey } = appConnection.credentials;

  // Returns only the parent environments the token can access (dev is scoped to the
  // token owner); preview branch children are excluded since syncs target the parent.
  const { data } = await request.get<TTriggerDevApiEnvironment[]>(
    `${instanceUrl}/api/v1/projects/${encodeURIComponent(projectRef)}/environments`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    }
  );

  return data.map((environment) => ({
    id: environment.id,
    slug: environment.slug,
    type: environment.type
  }));
};
