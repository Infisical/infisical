import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TOrgAdminAccessProjectDTO } from "./types";

export const useOrgAdminAccessProject = () =>
  useMutation({
    mutationFn: async ({ projectId }: TOrgAdminAccessProjectDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/organization-admin/projects/${projectId}/grant-admin-access`,
        {}
      );
      return data;
    }
  });
