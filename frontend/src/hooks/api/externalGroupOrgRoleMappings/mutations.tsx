import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { externalGroupOrgRoleMappingKeys } from "@app/hooks/api/externalGroupOrgRoleMappings/queries";
import { TSyncExternalGroupOrgRoleMappingsDTO } from "@app/hooks/api/externalGroupOrgRoleMappings/types";

export const useUpdateExternalGroupOrgRoleMappings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TSyncExternalGroupOrgRoleMappingsDTO) => {
      const { data } = await apiRequest.put("/api/v1/scim/group-org-role-mappings", payload);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: externalGroupOrgRoleMappingKeys.list() });
    }
  });
};
