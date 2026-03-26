import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  ClaimDomainDTO,
  DeleteDomainConnectorDTO,
  DomainSsoConnector,
  TakeoverDomainDTO,
  VerifyDomainDTO
} from "./types";

const domainSsoConnectorKeys = {
  all: ["domainSsoConnectors"] as const
};

export const useClaimDomain = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: ClaimDomainDTO) => {
      const { data } = await apiRequest.post<{ connector: DomainSsoConnector }>(
        "/api/v1/domain-sso-connectors",
        dto
      );
      return data.connector;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: domainSsoConnectorKeys.all });
    }
  });
};

export const useVerifyDomain = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectorId }: VerifyDomainDTO) => {
      const { data } = await apiRequest.post<{ connector: DomainSsoConnector }>(
        `/api/v1/domain-sso-connectors/${connectorId}/verify`
      );
      return data.connector;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: domainSsoConnectorKeys.all });
    }
  });
};

export const useTakeoverDomain = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectorId }: TakeoverDomainDTO) => {
      const { data } = await apiRequest.post<{ message: string }>(
        `/api/v1/domain-sso-connectors/${connectorId}/takeover`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: domainSsoConnectorKeys.all });
    }
  });
};

export const useDeleteDomainConnector = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectorId }: DeleteDomainConnectorDTO) => {
      const { data } = await apiRequest.delete<{ message: string }>(
        `/api/v1/domain-sso-connectors/${connectorId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: domainSsoConnectorKeys.all });
    }
  });
};
