import { CertStatus } from "./enums";

export type TCertificate = {
  id: string;
  caId: string;
  certificateTemplateId?: string;
  status: CertStatus;
  friendlyName: string;
  commonName: string;
  altNames: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
};

export type TDeleteCertDTO = {
  projectSlug: string;
  serialNumber: string;
};

export type TRevokeCertDTO = {
  projectSlug: string;
  serialNumber: string;
  revocationReason: string;
};
