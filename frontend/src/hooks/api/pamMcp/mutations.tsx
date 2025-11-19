import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSelectMcpScopeDTO, TSelectMcpScopeResponse } from "./types";

export const useSelectMcpScope = () => {
  return useMutation({
    mutationFn: async (dto: TSelectMcpScopeDTO) => {
      const { data } = await apiRequest.post<TSelectMcpScopeResponse>(
        "/api/v1/ai/mcp/oauth/select-mcp-scope",
        dto
      );
      return data;
    }
  });
};
