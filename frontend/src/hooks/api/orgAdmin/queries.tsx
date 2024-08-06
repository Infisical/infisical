import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { Workspace } from "../types";
import { TOrgAdminGetProjectsDTO } from "./types";

export const orgAdminQueryKeys = {
  getProjects: (filter: TOrgAdminGetProjectsDTO) => ["org-admin-projects", filter] as const
};

export const useOrgAdminGetProjects = ({ search, offset, limit = 50 }: TOrgAdminGetProjectsDTO) => {
  return useQuery({
    queryKey: orgAdminQueryKeys.getProjects({ search, offset, limit }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: Workspace[]; count: number }>(
        "/api/v1/organization-admin/projects",
        {
          params: {
            limit,
            offset,
            search
          }
        }
      );

      return data;
    }
  });
};
