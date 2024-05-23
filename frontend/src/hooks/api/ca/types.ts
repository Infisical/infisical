import { CertificateAuthorityType } from "./enums";

export type TCertificateAuthority = {
  id: string;
  parentCaId?: string;
  projectId: string;
  type: CertificateAuthorityType;
  dn: string;
  commonName: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateCaDTO = {
  projectSlug: string;
  type: string;
  organization: string;
  ou: string;
  country: string;
  province: string;
  locality: string;
  commonName: string;
};
