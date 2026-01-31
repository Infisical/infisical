/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { SupabaseConnectionMethod } from "./supabase-connection-constants";
import { SupabasePublicAPI } from "./supabase-connection-public-client";
import { TSupabaseConnection, TSupabaseConnectionConfig } from "./supabase-connection-types";

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
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to validate connection - verify credentials"
    });
  }

  return credentials;
};

export const listProjects = async (appConnection: TSupabaseConnection) => {
  try {
    return await SupabasePublicAPI.getProjects(appConnection);
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

export const listProjectBranches = async (appConnection: TSupabaseConnection, projectId: string) => {
  try {
    return await SupabasePublicAPI.getProjectBranches(appConnection, projectId);
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list project branches: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: "Unable to list project branches",
      error
    });
  }
};
