export type IncidentContact = {
  _id: string;
  email: string;
  organization: string;
  __v: number;
  createdAt: Date;
  updatedAt: Date;
};

export type DeleteIncidentContactDTO = {
  orgId: string;
  email: string;
};

export type AddIncidentContactDTO = {
  orgId: string;
  email: string;
};
