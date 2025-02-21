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
  projects: {
    name: string;
    id: string;
    slug: string;
  }[];
};

export type TProjectGateway = {
  id: string;
  identityId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string;
  serialNumber: string;
  heartbeat: string;
  projectGatewayId: string;
  identity: {
    name: string;
    id: string;
  };
};

export type TUpdateGatewayDTO = {
  id: string;
  name?: string;
  projectIds?: string[];
};

export type TDeleteGatewayDTO = {
  id: string;
};

export type TListProjectGatewayDTO = {
  projectId: string;
};
