export type TGatewayV2 = {
  id: string;
  identityId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  heartbeat: string;
  identity: {
    name: string;
    id: string;
  };
};
