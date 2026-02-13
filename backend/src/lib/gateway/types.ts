import net from "node:net";

import https from "https";

export type TGatewayTlsOptions = { ca: string; cert: string; key: string };

export enum GatewayProxyProtocol {
  Http = "http",
  Tcp = "tcp",
  Ping = "ping",
  Pam = "pam",
  PamSessionCancellation = "pam-session-cancellation"
}

export enum GatewayHttpProxyActions {
  InjectGatewayK8sServiceAccountToken = "inject-k8s-sa-auth-token",
  UseGatewayK8sServiceAccount = "use-k8s-sa"
}

export interface IGatewayProxyOptions {
  targetHost?: string;
  targetPort?: number;
  protocol: GatewayProxyProtocol;
  httpsAgent?: https.Agent;
  relayDetails: TGatewayV1RelayDetails;
}

export type TPingGatewayAndVerifyDTO = {
  relayHost: string;
  relayPort: number;
  tlsOptions: TGatewayTlsOptions;
  maxRetries?: number;
  identityId: string;
  orgId: string;
};

export interface IGatewayProxyServer {
  server: net.Server;
  port: number;
  cleanup: () => Promise<void>;
  getProxyError: () => string;
}

export type TGatewayV1RelayDetails = {
  relayAddress: string;
  tlsOptions: TGatewayTlsOptions;
  identityId: string;
  orgId: string;
  relayHost: string;
  relayPort: number;
};

export enum GatewayVersion {
  V1 = "v1",
  V2 = "v2"
}
