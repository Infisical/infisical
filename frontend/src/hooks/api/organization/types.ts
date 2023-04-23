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

export type CreateNewOrganization = {
  newOrgName: string;
}

export type NewOrganizationResponse = {
  data: {
    organization: {
      _id: string
    }
  }
}

export type DeleteOrganization = {
  organizationId: string;
}