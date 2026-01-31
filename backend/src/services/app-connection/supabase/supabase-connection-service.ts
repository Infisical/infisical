import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listProjects as getSupabaseProjects, listProjectBranches as getSupabaseProjectBranches } from "./supabase-connection-fns";
import { TSupabaseConnection } from "./supabase-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TSupabaseConnection>;

export const supabaseConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Supabase, connectionId, actor);
    try {
      const projects = await getSupabaseProjects(appConnection);

      return projects ?? [];
    } catch (error) {
      logger.error(error, "Failed to establish connection with Supabase");
      return [];
    }
  };

  const listProjectBranches = async (connectionId: string, actor: OrgServiceActor, projectId: string) => {
    const appConnection = await getAppConnection(AppConnection.Supabase, connectionId, actor);
    try {
      const branches = await getSupabaseProjectBranches(appConnection, projectId);

      return branches ?? [];
    } catch (error) {
      logger.error(error, "Failed to establish connection with Supabase");
      return [];
    }
  };

  return {
    listProjects,
    listProjectBranches
  };
};
