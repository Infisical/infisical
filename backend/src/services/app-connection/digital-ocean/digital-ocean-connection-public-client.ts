/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
import { AxiosInstance } from "axios";

import { createRequestClient } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { DigitalOceanConnectionMethod } from "./digital-ocean-connection-constants";
import {
  TDigitalOceanApp,
  TDigitalOceanConnectionConfig,
  TDigitalOceanVariable
} from "./digital-ocean-connection-types";

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
        await this.getApps(connection);
        break;
      default:
        throw new Error(`Unsupported connection method`);
    }
  }

  async getApps(connection: TDigitalOceanConnectionConfig) {
    const response = await this.client.get<{ apps: TDigitalOceanApp[] }>(`/apps`, {
      headers: {
        Authorization: `Bearer ${connection.credentials.apiToken}`
      }
    });

    return response.data.apps;
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

    const variables = existing.filter((v) => input.find((i) => i.key === v.key));

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
