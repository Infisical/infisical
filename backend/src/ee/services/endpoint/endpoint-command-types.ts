import { EndpointCommandStatus } from "./endpoint-enums";

export type TExecuteEndpointCommandDTO = {
  deviceId: string;
  command: string;
  args: string[];
  shell: boolean;
  timeoutSeconds: number;
  reason?: string;
};

export type TListEndpointCommandsDTO = {
  deviceId?: string;
  limit: number;
  cursor?: string;
};

export type TGetEndpointCommandDTO = {
  commandId: string;
};

export type TCancelEndpointCommandDTO = {
  commandId: string;
};

export type TReportEndpointCommandResultDTO = {
  commandId: string;
  // Absent when the agent never got as far as running it, which is what 'error' explains.
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  outputTruncated: boolean;
  timedOut: boolean;
  error?: string;
};

export type TEndpointCommandResponse = {
  id: string;
  deviceId: string;
  deviceName?: string;
  status: EndpointCommandStatus;
  shell: boolean;
  command: string;
  args: string[];
  timeoutSeconds: number;
  expiresAt: Date;
  requestedByEmail: string | null;
  reason: string | null;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  outputTruncated: boolean;
  error: string | null;
  createdAt: Date;
};
