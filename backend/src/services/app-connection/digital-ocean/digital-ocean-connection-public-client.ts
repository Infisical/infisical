/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
import { AxiosInstance, AxiosResponse } from "axios";

import { createRequestClient } from "@app/lib/config/request";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import {
  DIGITAL_OCEAN_MAX_PAGES,
  DIGITAL_OCEAN_PAGE_SIZE,
  DigitalOceanConnectionMethod
} from "./digital-ocean-connection-constants";
import {
  TDigitalOceanApp,
  TDigitalOceanConnectionConfig,
  TDigitalOceanListAppsResponse,
  TDigitalOceanVariable
} from "./digital-ocean-connection-types";

const isValidNextUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url, IntegrationUrls.DIGITAL_OCEAN_API_URL);
    const expected = new URL(IntegrationUrls.DIGITAL_OCEAN_API_URL);
    return parsed.protocol === "https:" && parsed.origin === expected.origin;
  } catch {
    return false;
  }
};

class DigitalOceanAppPlatformPublicClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = createRequestClient({
      baseURL: `${IntegrationUrls.DIGITAL_OCEAN_API_URL}/v2`,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    });
  }

  async healthcheck(connection: TDigitalOceanConnectionConfig) {
    switch (connection.method) {
      case DigitalOceanConnectionMethod.ApiToken:
        await this.client.get(`/apps?per_page=1`, {
          headers: {
            Authorization: `Bearer ${connection.credentials.apiToken}`
          }
        });
        break;
      default:
        throw new Error(`Unsupported connection method`);
    }
  }

  async getApps(connection: TDigitalOceanConnectionConfig): Promise<TDigitalOceanApp[]> {
    const apps: TDigitalOceanApp[] = [];
    let nextUrl: string | undefined = `/apps?per_page=${DIGITAL_OCEAN_PAGE_SIZE}`;
    let pageCount = 0;

    while (nextUrl && pageCount < DIGITAL_OCEAN_MAX_PAGES) {
      const response: AxiosResponse<TDigitalOceanListAppsResponse> = await this.client.get(nextUrl, {
        headers: {
          Authorization: `Bearer ${connection.credentials.apiToken}`
        }
      });
      const { data } = response;

      apps.push(...(data.apps ?? []));

      const rawNextUrl = data.links?.pages?.next;
      if (rawNextUrl) {
        if (isValidNextUrl(rawNextUrl)) {
          nextUrl = rawNextUrl;
        } else {
          logger.warn(
            `Rejected off-origin or non-HTTPS pagination URL in DigitalOcean client: ${sanitizeUrlForLog(rawNextUrl)}`
          );
          nextUrl = undefined;
        }
      } else {
        nextUrl = undefined;
      }

      pageCount += 1;
    }

    if (nextUrl) {
      logger.warn(
        `DigitalOcean app listing hit page cap of ${DIGITAL_OCEAN_MAX_PAGES} pages for URL: ${sanitizeUrlForLog(nextUrl)}`
      );
    }

    return apps;
  }

  async getApp(connection: TDigitalOceanConnectionConfig, appId: string) {
    const response = await this.client.get<{ app: TDigitalOceanApp }>(`/apps/${appId}`, {
      headers: {
        Authorization: `Bearer ${connection.credentials.apiToken}`
      }
    });

    return response.data.app;
  }

  async getVariables(connection: TDigitalOceanConnectionConfig, appId: string): Promise<TDigitalOceanVariable[]> {
    const app = await this.getApp(connection, appId);
    return app.spec.envs || [];
  }

  async putVariables(connection: TDigitalOceanConnectionConfig, appId: string, ...input: TDigitalOceanVariable[]) {
    const response = await this.getApp(connection, appId);

    return this.client.put(
      `/apps/${appId}`,
      {
        spec: {
          ...response.spec,
          envs: input
        }
      },
      {
        headers: {
          Authorization: `Bearer ${connection.credentials.apiToken}`
        }
      }
    );
  }

  async deleteVariables(connection: TDigitalOceanConnectionConfig, appId: string, ...input: TDigitalOceanVariable[]) {
    const response = await this.getApp(connection, appId);
    const existing = response.spec.envs || [];

    const variables = existing.filter((v) => !input.some((i) => i.key === v.key));

    return this.client.put(
      `/apps/${appId}`,
      {
        spec: {
          ...response.spec,
          envs: variables
        }
      },
      {
        headers: {
          Authorization: `Bearer ${connection.credentials.apiToken}`
        }
      }
    );
  }
}

export const DigitalOceanAppPlatformPublicAPI = new DigitalOceanAppPlatformPublicClient();
