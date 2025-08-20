export enum BridgeRuleOperator {
  EQ = "$eq",
  NEQ = "$neq", 
  IN = "$in",
  GLOB = "$glob"
}

export type TBridgeRule = {
  field: string;
  operator: BridgeRuleOperator;
  value: string;
};

export type TBridgeHeader = {
  key: string;
  value: string;
};

export type TBridge = {
  id: string;
  projectId: string;
  baseUrl: string;
  slug: string;
  openApiUrl: string;
  ruleSet: TBridgeRule[][];
  headers?: TBridgeHeader[];
  createdAt: string;
  updatedAt: string;
};

export type TCreateBridgeDTO = {
  projectId: string;
  baseUrl: string;
  openApiUrl: string;
  slug: string;
  ruleSet: TBridgeRule[][];
  headers: TBridgeHeader[];
};

export type TUpdateBridgeDTO = {
  id: string;
  baseUrl?: string;
  openApiUrl?: string;
  slug?: string;
  ruleSet?: TBridgeRule[][];
  headers?: TBridgeHeader[];
};

export type TDeleteBridgeDTO = {
  id: string;
};

export type TGetBridgesByProjectDTO = {
  projectId: string;
};

export type TGetBridgeByIdDTO = {
  id: string;
};
