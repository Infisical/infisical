export enum ScimEvent {
  LIST_USERS = "list-users",
  GET_USER = "get-user",
  CREATE_USER = "create-user",
  UPDATE_USER = "update-user",
  REPLACE_USER = "replace-user",
  DELETE_USER = "delete-user",

  LIST_GROUPS = "list-groups",
  GET_GROUP = "get-group",
  CREATE_GROUP = "create-group",
  UPDATE_GROUP = "update-group",
  REPLACE_GROUP = "replace-group",
  DELETE_GROUP = "delete-group"
}

export type ScimTokenData = {
  id: string;
  ttlDays: number;
  description: string;
  tokenSuffix: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateScimTokenDTO = {
  organizationId: string;
  description?: string;
  ttlDays?: number;
};

export type DeleteScimTokenDTO = {
  organizationId: string;
  scimTokenId: string;
};

export type CreateScimTokenRes = {
  scimToken: string;
};

export type ScimEventData = {
  id: string;
  orgId: string;
  eventType: ScimEvent;
  event?: any | null;
  createdAt: string;
  updatedAt: string;
};

export type GetScimEventsDTO = {
  since?: string;
  limit?: number;
  offset?: number;
  disabled?: boolean;
};
