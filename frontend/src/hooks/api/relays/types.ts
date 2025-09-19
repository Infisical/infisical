export type TRelay = {
  id: string;
  createdAt: string;
  updatedAt: string;
  orgId: string | null;
  identityId: string | null;
  name: string;
  host: string;
};

export type TDeleteRelayDTO = {
  id: string;
};
