export type Organization = {
  _id: string;
  name: string;
  createAt: string;
  updatedAt: string;
};

export type RenameOrgDTO = {
  orgId: string;
  newOrgName: string;
};
