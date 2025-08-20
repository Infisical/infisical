export enum BridgeRuleOperator {
  EQ = "eq",
  NEQ = "ne",
  CONTAINS = "contains",
  NOT_CONTAINS = "not_contains",
  STARTS_WITH = "starts_with",
  NOT_STARTS_WITH = "not_starts_with",
  ENDS_WITH = "ends_with",
  NOT_ENDS_WITH = "not_ends_with",
  WILDCARD = "wildcard",
  IN = "in"
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
