export type TGateway = {
  id: string;
  identityId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string;
  serialNumber: string;
  identity: {
    name: string;
    id: string;
  };
};

export type TDeleteGatewayDTO = {
  id: string;
};
