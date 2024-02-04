export type IncidentContact = {
  id: string;
  email: string;
  organization: string;
  __v: number;
  createdAt: Date;
  updatedAt: Date;
};

export type DeleteIncidentContactDTO = {
  orgId: string;
  incidentContactId: string;
};

export type AddIncidentContactDTO = {
  orgId: string;
  email: string;
};
