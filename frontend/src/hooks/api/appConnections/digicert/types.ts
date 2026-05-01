export type TDigiCertOrganization = {
  id: number;
  name: string;
  displayName?: string;
  status?: string;
};

export type TDigiCertProduct = {
  nameId: string;
  name: string;
  type?: string;
  validationType?: string;
};
