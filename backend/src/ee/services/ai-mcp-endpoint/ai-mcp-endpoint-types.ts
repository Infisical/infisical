export type TCreateAiMcpEndpointDTO = {
  projectId: string;
  name: string;
  description?: string;
  serverIds?: string[];
};

export type TUpdateAiMcpEndpointDTO = {
  endpointId: string;
  name?: string;
  description?: string;
  serverIds?: string[];
};

export type TDeleteAiMcpEndpointDTO = {
  endpointId: string;
};

export type TGetAiMcpEndpointDTO = {
  endpointId: string;
};

export type TListAiMcpEndpointsDTO = {
  projectId: string;
};

export type TAiMcpEndpointWithServers = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  connectedServers: number;
  activeTools: number;
};

export type TListEndpointToolsDTO = {
  endpointId: string;
};

export type TEnableEndpointToolDTO = {
  endpointId: string;
  serverToolId: string;
};

export type TDisableEndpointToolDTO = {
  endpointId: string;
  serverToolId: string;
};

export type TBulkUpdateEndpointToolsDTO = {
  endpointId: string;
  tools: Array<{
    serverToolId: string;
    isEnabled: boolean;
  }>;
};

export type TEndpointToolConfig = {
  id: string;
  aiMcpEndpointId: string;
  aiMcpServerToolId: string;
  isEnabled: boolean;
};
