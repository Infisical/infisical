import { TActorInput } from "@app/lib/types";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";

export type TCreatePkiTemplateDTO = {
  caName: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
  projectId: string;
} & TActorInput;

export type TUpdatePkiTemplateDTO = {
  templateName: string;
  caName?: string;
  name?: string;
  commonName?: string;
  subjectAlternativeName?: string;
  ttl?: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
  projectId: string;
} & TActorInput;

export type TListPkiTemplateDTO = {
  limit?: number;
  offset?: number;
  projectId: string;
} & TActorInput;

export type TGetPkiTemplateDTO = {
  templateName: string;
  projectId: string;
} & TActorInput;

export type TDeletePkiTemplateDTO = {
  templateName: string;
  projectId: string;
} & TActorInput;

export type TIssueCertPkiTemplateDTO = {
  templateName: string;
  commonName: string;
  altNames: string;
  ttl: string;
  notBefore?: string;
  notAfter?: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
  projectId: string;
} & TActorInput;

export type TSignCertPkiTemplateDTO = {
  templateName: string;
  csr: string;
  ttl: string;
  projectId: string;
} & TActorInput;
