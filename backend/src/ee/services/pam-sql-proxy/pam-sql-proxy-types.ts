// websocket message types used for the sql proxy
export enum SqlProxyMessageType {
  // to backend, from frontend
  Query = "query",
  Close = "close",
  Status = "status",

  // to frontend, from backend
  Result = "result",
  Error = "error",
  Connected = "connected",
  Disconnected = "disconnected"
}

// to backend, from frontend
export type TSqlProxyQueryMessage = {
  type: SqlProxyMessageType.Query;
  query: string;
};

export type TSqlProxyCloseMessage = {
  type: SqlProxyMessageType.Close;
};

export type TSqlProxyStatusMessage = {
  type: SqlProxyMessageType.Status;
};

export type TSqlProxyIncomingMessage =
  | TSqlProxyQueryMessage
  | TSqlProxyCloseMessage
  | TSqlProxyStatusMessage;

// to frontend, from backend
export type TSqlProxyResultMessage = {
  type: SqlProxyMessageType.Result;
  data: {
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    command: string;
    duration: number;
  };
};

export type TSqlProxyErrorMessage = {
  type: SqlProxyMessageType.Error;
  message: string;
};

export type TSqlProxyConnectedMessage = {
  type: SqlProxyMessageType.Connected;
  database: string;
  host: string;
  port: number;
  resourceName: string;
  accountName: string;
};

export type TSqlProxyDisconnectedMessage = {
  type: SqlProxyMessageType.Disconnected;
};

export type TSqlProxyOutgoingMessage =
  | TSqlProxyResultMessage
  | TSqlProxyErrorMessage
  | TSqlProxyConnectedMessage
  | TSqlProxyDisconnectedMessage;
