export type TMCPActivityLog = {
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
