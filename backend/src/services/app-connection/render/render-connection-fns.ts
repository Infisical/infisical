/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { RenderConnectionMethod } from "./render-connection-enums";
import {
  TRawRenderService,
  TRenderConnection,
  TRenderConnectionConfig,
  TRenderService
} from "./render-connection-types";

export const getRenderConnectionListItem = () => {
  return {
    name: "Render" as const,
    app: AppConnection.Render as const,
    methods: Object.values(RenderConnectionMethod) as [RenderConnectionMethod.ApiKey]
  };
};

export const listRenderServices = async (appConnection: TRenderConnection): Promise<TRenderService[]> => {
  const {
    credentials: { apiKey }
  } = appConnection;

  const services: TRenderService[] = [];
  let hasMorePages = true;
  const perPage = 100;
  let cursor;

  while (hasMorePages) {
    const res: TRawRenderService[] = (
      await request.get<TRawRenderService[]>(`${IntegrationUrls.RENDER_API_URL}/v1/services`, {
        params: new URLSearchParams({
          ...(cursor ? { cursor: String(cursor) } : {}),
          limit: String(perPage)
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "Accept-Encoding": "application/json"
        }
      })
    ).data;

    res.forEach((item) => {
      services.push({
        name: item.service.name,
        id: item.service.id
      });
    });

    if (res.length < perPage) {
      hasMorePages = false;
    } else {
      cursor = res[res.length - 1].cursor;
    }
  }

  return services;
};

export const validateRenderConnectionCredentials = async (config: TRenderConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    await request.get(`${IntegrationUrls.RENDER_API_URL}/v1/users`, {
      headers: {
        Authorization: `Bearer ${inputCredentials.apiKey}`
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

  return inputCredentials;
};
