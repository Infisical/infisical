/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { SupabaseConnectionMethod } from "./supabase-connection-constants";
import { SupabasePublicAPI } from "./supabase-connection-public-client";
import { TSupabaseConnection, TSupabaseConnectionConfig, TSupabaseProjectItem } from "./supabase-connection-types";

export const getSupabaseConnectionListItem = () => {
  return {
    name: "Supabase" as const,
    app: AppConnection.Supabase as const,
    methods: Object.values(SupabaseConnectionMethod)
  };
};

export const validateSupabaseConnectionCredentials = async (config: TSupabaseConnectionConfig) => {
  const { credentials } = config;

  try {
    await SupabasePublicAPI.healthcheck(config);
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      const is403 = error.response?.status === 403 || error.status === 403;
      const message =
        !credentials.projectRef && is403
          ? `Failed to validate credentials: ${error.message || "Request failed with status code 403"}. If using a project-scoped access token, please specify a Project Reference.`
          : `Failed to validate credentials: ${error.message || "Unknown error"}`;

      throw new BadRequestError({
        message
      });
    }

    throw new BadRequestError({
      message: "Unable to validate connection - verify credentials"
    });
  }

  return credentials;
};

export const listProjects = async (appConnection: TSupabaseConnection): Promise<TSupabaseProjectItem[]> => {
  const { credentials } = appConnection;

  if (credentials.projectRef) {
    return [{ id: credentials.projectRef, name: credentials.projectRef }];
  }

  try {
    const projects = await SupabasePublicAPI.getProjects(appConnection);
    return projects ?? [];
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list projects: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: "Unable to list projects",
      error
    });
  }
};
