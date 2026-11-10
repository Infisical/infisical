export type TOrgAiConfig = {
  connectionId: string;
  connectionName: string;
  model: string;
};

export type TUpdateOrgAiConfigDTO = {
  connectionId: string | null;
  model: string | null;
};

export type TAnthropicModel = { id: string; displayName: string };
