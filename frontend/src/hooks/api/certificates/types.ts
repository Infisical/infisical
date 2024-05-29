import { CertStatus } from "./enums";

export type TCertificate = {
  id: string;
  caId: string;
  status: CertStatus;
  commonName: string;
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
};
