export type TGateway = {
  id: string;
  identityId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string;
  serialNumber: string;
  heartbeat: string;
  identity: {
    name: string;
    id: string;
  };
};

export type TUpdateGatewayDTO = {
  id: string;
  name?: string;
};

export type TDeleteGatewayDTO = {
  id: string;
};
