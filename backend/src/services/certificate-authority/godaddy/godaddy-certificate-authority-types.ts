import { z } from "zod";

import {
  CreateGoDaddyCertificateAuthoritySchema,
  GoDaddyCertificateAuthoritySchema,
  GoDaddyCertificateRequestMetadataSchema,
  UpdateGoDaddyCertificateAuthoritySchema
} from "./godaddy-certificate-authority-schemas";

export type TGoDaddyCertificateAuthority = z.infer<typeof GoDaddyCertificateAuthoritySchema>;

export type TCreateGoDaddyCertificateAuthorityDTO = z.infer<typeof CreateGoDaddyCertificateAuthoritySchema>;

export type TUpdateGoDaddyCertificateAuthorityDTO = z.infer<typeof UpdateGoDaddyCertificateAuthoritySchema>;

export type TGoDaddyCertificateRequestMetadata = z.infer<typeof GoDaddyCertificateRequestMetadataSchema>;

export type TCreateCertificateRequest = {
  commonName: string;
  csr: string;
  period: number;
  productType: string;
  rootType?: string;
  subjectAlternativeNames?: string[];
};

export type TCreateCertificateResponse = {
  certificateId: string;
};

export type TRenewCertificateRequest = {
  commonName?: string;
  csr?: string;
  period?: number;
  rootType?: string;
  subjectAlternativeNames?: string[];
};

export type TGetCertificateResponse = {
  certificateId: string;
  status: string;
  commonName?: string;
  serialNumber?: string;
  validStart?: string;
  validEnd?: string;
  productType?: string;
  subjectAlternativeNames?: { subjectAlternativeName: string; status?: string }[];
};

export type TCertificateBundleResponse = {
  pems: {
    certificate: string;
    cross?: string;
    intermediate?: string;
    root?: string;
  };
  serialNumber?: string;
};
