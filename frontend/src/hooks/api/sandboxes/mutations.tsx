import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { sandboxKeys } from "./queries";
import {
  SandboxIntegrationType,
  TCreateSandboxDTO,
  TSandbox,
  TSandboxExecResult,
  TSandboxSecretRef,
  TUpdateSandboxDTO
} from "./types";

export const useCreateSandbox = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TCreateSandboxDTO) => {
      const { data } = await apiRequest.post<{ sandbox: TSandbox }>("/api/v1/sandboxes", dto);
      return data.sandbox;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sandboxKeys.list() })
  });
};

export const useUpdateSandbox = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sandboxId, ...body }: TUpdateSandboxDTO) => {
      const { data } = await apiRequest.patch<{ sandbox: TSandbox }>(
        `/api/v1/sandboxes/${sandboxId}`,
        body
      );
      return data.sandbox;
    },
    onSuccess: (_, { sandboxId }) => {
      queryClient.invalidateQueries({ queryKey: sandboxKeys.list() });
      queryClient.invalidateQueries({ queryKey: sandboxKeys.byId(sandboxId) });
    }
  });
};

export const useDeleteSandbox = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sandboxId: string) => {
      await apiRequest.delete(`/api/v1/sandboxes/${sandboxId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sandboxKeys.list() })
  });
};

export const useSetSandboxPower = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sandboxId, action }: { sandboxId: string; action: "start" | "stop" }) => {
      const { data } = await apiRequest.post<{ sandbox: TSandbox }>(
        `/api/v1/sandboxes/${sandboxId}/${action}`
      );
      return data.sandbox;
    },
    onSuccess: (_, { sandboxId }) => {
      queryClient.invalidateQueries({ queryKey: sandboxKeys.list() });
      queryClient.invalidateQueries({ queryKey: sandboxKeys.byId(sandboxId) });
    }
  });
};

/**
 * Deliberately not a useMutation-with-invalidation: the terminal drives this in a read loop and
 * refetching the sandbox after every keystroke-completed command would fight the loop.
 */
export const execInSandbox = async (sandboxId: string, command: string) => {
  const { data } = await apiRequest.post<{ result: TSandboxExecResult }>(
    `/api/v1/sandboxes/${sandboxId}/exec`,
    { command }
  );
  return data.result;
};

export const useAddSandboxIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sandboxId,
      ...body
    }: {
      sandboxId: string;
      type: SandboxIntegrationType;
      hostnames?: string[];
      secret: TSandboxSecretRef;
    }) => {
      const { data } = await apiRequest.post<{ sandbox: TSandbox }>(
        `/api/v1/sandboxes/${sandboxId}/integrations`,
        body
      );
      return data.sandbox;
    },
    onSuccess: (_, { sandboxId }) => {
      queryClient.invalidateQueries({ queryKey: sandboxKeys.byId(sandboxId) });
      queryClient.invalidateQueries({ queryKey: sandboxKeys.list() });
    }
  });
};

export const useRemoveSandboxIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sandboxId,
      integrationId
    }: {
      sandboxId: string;
      integrationId: string;
    }) => {
      const { data } = await apiRequest.delete<{ sandbox: TSandbox }>(
        `/api/v1/sandboxes/${sandboxId}/integrations/${integrationId}`
      );
      return data.sandbox;
    },
    onSuccess: (_, { sandboxId }) => {
      queryClient.invalidateQueries({ queryKey: sandboxKeys.byId(sandboxId) });
      queryClient.invalidateQueries({ queryKey: sandboxKeys.list() });
    }
  });
};
