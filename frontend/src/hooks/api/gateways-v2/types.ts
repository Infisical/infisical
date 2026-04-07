export enum GatewayHealthCheckStatus {
  Healthy = "healthy",
  Failed = "failed"
}

export type TGatewayV2 = {
  id: string;
  identityId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  heartbeat: string;
  lastHealthCheckStatus: GatewayHealthCheckStatus | null;
  identity: {
    name: string;
    id: string;
  };
};
