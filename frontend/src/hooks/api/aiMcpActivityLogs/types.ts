export type TAiMcpActivityLog = {
  id: string;
  projectId: string;
  endpointName: string;
  serverName: string;
  toolName: string;
  actor: string;
  request: unknown;
  response: unknown;
  createdAt: string;
  updatedAt: string;
};

export type TListAiMcpActivityLogsFilter = {
  projectId: string;
  endpointName?: string;
  serverName?: string;
  toolName?: string;
  actor?: string;
  startDate: Date;
  endDate: Date;
  limit: number;
};

export type TListAiMcpActivityLogsDTO = {
  projectId: string;
};
