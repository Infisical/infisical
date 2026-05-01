export type TGatewayPool = {
  id: string;
  orgId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  healthyMemberCount: number;
  memberGatewayIds: string[];
  connectedResourcesCount: number;
};

export type TGatewayPoolConnectedResources = {
  kubernetesAuths: {
    id: string;
    identityId: string;
    identityName: string | null;
  }[];
};

export type TGatewayPoolMember = {
  id: string;
  name: string;
  heartbeat: string | null;
  lastHealthCheckStatus: string | null;
};

export type TGatewayPoolWithMembers = {
  id: string;
  orgId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  gateways: TGatewayPoolMember[];
};

export type TGatewayPoolMembership = {
  id: string;
  gatewayPoolId: string;
  gatewayId: string;
  createdAt: string;
};

export type TCreateGatewayPoolDTO = {
  name: string;
};

export type TUpdateGatewayPoolDTO = {
  poolId: string;
  name?: string;
};

export type TAddGatewayToPoolDTO = {
  poolId: string;
  gatewayId: string;
};

export type TRemoveGatewayFromPoolDTO = {
  poolId: string;
  gatewayId: string;
};
