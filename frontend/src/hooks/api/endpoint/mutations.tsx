import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { endpointKeys } from "./queries";
import {
  TCancelEndpointCommandDTO,
  TDeviceTargetAccessDTO,
  TCreateEndpointNetworkRuleDTO,
  TCreateEndpointTargetDTO,
  TDeleteEndpointDeviceDTO,
  TDeleteEndpointNetworkRuleDTO,
  TDeleteEndpointTargetDTO,
  TEndpointCommand,
  TEndpointDevice,
  TEndpointNetworkRule,
  TEndpointTarget,
  TExecuteEndpointCommandDTO,
  TRegisterEndpointDeviceDTO,
  TUpdateEndpointNetworkRuleDTO,
  TUpdateEndpointTargetDTO
} from "./types";

export const useRegisterEndpointDevice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TRegisterEndpointDeviceDTO) => {
      const { data } = await apiRequest.post<{ device: TEndpointDevice }>(
        "/api/v1/endpoint/devices",
        dto
      );
      return data.device;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: endpointKeys.devices() })
  });
};

export const useDeleteEndpointDevice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deviceId }: TDeleteEndpointDeviceDTO) => {
      const { data } = await apiRequest.delete<{ device: TEndpointDevice }>(
        `/api/v1/endpoint/devices/${deviceId}`
      );
      return data.device;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: endpointKeys.devices() })
  });
};

// A rule change bumps every device's config version, so the device list is refreshed too.
const invalidateNetworkPolicy = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: endpointKeys.networkRules() }),
    queryClient.invalidateQueries({ queryKey: endpointKeys.devices() })
  ]);

export const useCreateEndpointNetworkRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TCreateEndpointNetworkRuleDTO) => {
      const { data } = await apiRequest.post<{ networkRule: TEndpointNetworkRule }>(
        "/api/v1/endpoint/network-rules",
        dto
      );
      return data.networkRule;
    },
    onSuccess: () => invalidateNetworkPolicy(queryClient)
  });
};

export const useUpdateEndpointNetworkRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId, ...dto }: TUpdateEndpointNetworkRuleDTO) => {
      const { data } = await apiRequest.patch<{ networkRule: TEndpointNetworkRule }>(
        `/api/v1/endpoint/network-rules/${ruleId}`,
        dto
      );
      return data.networkRule;
    },
    onSuccess: () => invalidateNetworkPolicy(queryClient)
  });
};

export const useDeleteEndpointNetworkRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId }: TDeleteEndpointNetworkRuleDTO) => {
      const { data } = await apiRequest.delete<{ networkRule: TEndpointNetworkRule }>(
        `/api/v1/endpoint/network-rules/${ruleId}`
      );
      return data.networkRule;
    },
    onSuccess: () => invalidateNetworkPolicy(queryClient)
  });
};

// A target or assignment change bumps every device's config version, the same as a rule change, so
// the device list is refreshed alongside the targets.
const invalidateTargets = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: endpointKeys.targets() }),
    queryClient.invalidateQueries({ queryKey: endpointKeys.devices() })
  ]);

export const useCreateEndpointTarget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TCreateEndpointTargetDTO) => {
      const { data } = await apiRequest.post<{ target: TEndpointTarget }>(
        "/api/v1/endpoint/targets",
        dto
      );
      return data.target;
    },
    onSuccess: () => invalidateTargets(queryClient)
  });
};

export const useUpdateEndpointTarget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetId, ...dto }: TUpdateEndpointTargetDTO) => {
      const { data } = await apiRequest.patch<{ target: TEndpointTarget }>(
        `/api/v1/endpoint/targets/${targetId}`,
        dto
      );
      return data.target;
    },
    onSuccess: () => invalidateTargets(queryClient)
  });
};

export const useDeleteEndpointTarget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetId }: TDeleteEndpointTargetDTO) => {
      const { data } = await apiRequest.delete<{ target: TEndpointTarget }>(
        `/api/v1/endpoint/targets/${targetId}`
      );
      return data.target;
    },
    onSuccess: () => invalidateTargets(queryClient)
  });
};

// The event feed carries command.issued and command.completed too, so both are invalidated together.
const invalidateCommands = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({ queryKey: endpointKeys.commands() });
  void queryClient.invalidateQueries({ queryKey: endpointKeys.events() });
};

export const useExecuteEndpointCommand = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TExecuteEndpointCommandDTO) => {
      const { data } = await apiRequest.post<{ command: TEndpointCommand }>(
        "/api/v1/endpoint/commands",
        dto
      );
      return data.command;
    },
    onSuccess: () => invalidateCommands(queryClient)
  });
};

export const useCancelEndpointCommand = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commandId }: TCancelEndpointCommandDTO) => {
      const { data } = await apiRequest.post<{ command: TEndpointCommand }>(
        `/api/v1/endpoint/commands/${commandId}/cancel`
      );
      return data.command;
    },
    onSuccess: () => invalidateCommands(queryClient)
  });
};

// Granting is a PUT and revoking a DELETE on one device's grant, rather than a rewrite of the
// target's whole device list: two admins editing two different devices must not overwrite each
// other, and the agent config version moves either way.
export const useGrantDeviceTargetAccess = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deviceId, targetId }: TDeviceTargetAccessDTO) => {
      const { data } = await apiRequest.put<{ target: TEndpointTarget }>(
        `/api/v1/endpoint/devices/${deviceId}/targets/${targetId}`
      );
      return data.target;
    },
    onSuccess: () => invalidateTargets(queryClient)
  });
};

export const useRevokeDeviceTargetAccess = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deviceId, targetId }: TDeviceTargetAccessDTO) => {
      const { data } = await apiRequest.delete<{ target: TEndpointTarget }>(
        `/api/v1/endpoint/devices/${deviceId}/targets/${targetId}`
      );
      return data.target;
    },
    onSuccess: () => invalidateTargets(queryClient)
  });
};
