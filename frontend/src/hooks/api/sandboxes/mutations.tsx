import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { getAuthToken } from "@app/hooks/api/reactQuery";

import { sandboxKeys } from "./queries";
import {
  SandboxIntegrationType,
  TAgentMessage,
  TAgentTurn,
  TCreateSandboxDTO,
  TLinkSandboxSlackDTO,
  TSandbox,
  TSandboxActivityEntry,
  TSandboxCredentialConfig,
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
      credential?: TSandboxCredentialConfig;
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

export const useChatWithAgent = () =>
  useMutation({
    mutationFn: async ({
      sandboxId,
      messages
    }: {
      sandboxId: string;
      messages: TAgentMessage[];
    }) => {
      const { data } = await apiRequest.post<TAgentTurn>(`/api/v1/sandboxes/${sandboxId}/chat`, {
        messages
      });
      return data;
    }
  });

export type TAgentStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; command: string }
  | { type: "tool_end"; command: string; exitCode: number | null; output: string }
  | { type: "done"; reply: string }
  | { type: "error"; message: string };

/**
 * Streams one agent turn over SSE. Uses fetch rather than EventSource because the request is a POST
 * carrying the conversation, and EventSource is GET-only.
 */
export const streamAgentChat = async (
  sandboxId: string,
  messages: TAgentMessage[],
  onEvent: (event: TAgentStreamEvent) => void,
  signal?: AbortSignal
) => {
  const response = await fetch(`/api/v1/sandboxes/${sandboxId}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
    body: JSON.stringify({ messages }),
    signal
  });

  if (!response.ok || !response.body) {
    const detail = (await response.json().catch(() => null)) as { message?: unknown } | null;
    const message =
      typeof detail?.message === "string" ? detail.message : "The agent could not be reached.";
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- reading a stream is inherently sequential
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line, sent as CRLF, so match either form.
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";

    frames.forEach((frame) => {
      const line = frame.split(/\r?\n/).find((l) => l.startsWith("data:"));
      if (!line) return;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as TAgentStreamEvent);
      } catch {
        // partial frame, the next chunk completes it
      }
    });
  }
};

export type TSandboxBootEvent =
  | { type: "step"; label: string; message: string }
  | { type: "log"; message: string }
  | { type: "ready" }
  | { type: "error"; message: string };

/** Starts a sandbox and streams the boot as it happens. Same SSE shape as the agent chat. */
export const streamSandboxStart = async (
  sandboxId: string,
  onEvent: (event: TSandboxBootEvent) => void,
  signal?: AbortSignal
) => {
  const response = await fetch(`/api/v1/sandboxes/${sandboxId}/start/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
    signal
  });

  if (!response.ok || !response.body) {
    const detail = (await response.json().catch(() => null)) as { message?: unknown } | null;
    const message =
      typeof detail?.message === "string" ? detail.message : "The sandbox could not be started.";
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- reading a stream is inherently sequential
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";

    frames.forEach((frame) => {
      const line = frame.split(/\r?\n/).find((l) => l.startsWith("data:"));
      if (!line) return;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as TSandboxBootEvent);
      } catch {
        // partial frame, the next chunk completes it
      }
    });
  }
};

export const useLinkSandboxSlack = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sandboxId, ...body }: TLinkSandboxSlackDTO) => {
      const { data } = await apiRequest.post<{ sandbox: TSandbox }>(
        `/api/v1/sandboxes/${sandboxId}/slack-link`,
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

/**
 * Opens the live command log. Mirrors the chat stream rather than using EventSource, which cannot
 * carry an Authorization header. Resolves when the connection closes; abort via the signal.
 */
export const streamSandboxCommands = async (
  sandboxId: string,
  onEntry: (entry: TSandboxActivityEntry) => void,
  signal?: AbortSignal
) => {
  const response = await fetch(`/api/v1/sandboxes/${sandboxId}/commands/stream`, {
    headers: { Authorization: `Bearer ${getAuthToken()}` },
    signal
  });

  if (!response.ok || !response.body) {
    throw new Error("Could not open the command log.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- reading a stream is inherently sequential
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    frames.forEach((frame) => {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) return;

      try {
        onEntry(JSON.parse(line.slice(5).trim()) as TSandboxActivityEntry);
      } catch {
        // a partial frame; the next chunk completes it
      }
    });
  }
};

export const useTerminateSandboxProcess = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sandboxId, pid }: { sandboxId: string; pid: number }) => {
      await apiRequest.post(`/api/v1/sandboxes/${sandboxId}/processes/${pid}/terminate`);
    },
    onSuccess: (_, { sandboxId }) => {
      queryClient.invalidateQueries({ queryKey: sandboxKeys.processes(sandboxId) });
    }
  });
};
