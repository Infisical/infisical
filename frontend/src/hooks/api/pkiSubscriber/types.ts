import { CertExtendedKeyUsage, CertKeyUsage } from "../certificates/enums";

export enum PkiSubscriberStatus {
  ACTIVE = "active",
  DISABLED = "disabled"
}

export type TPkiSubscriber = {
  id: string;
  projectId: string;
  caId: string;
  name: string;
  commonName: string;
  status: PkiSubscriberStatus;
  ttl: string;
  subjectAlternativeNames: string[];
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
};

export type TCreatePkiSubscriberDTO = {
  projectId: string;
  caId: string;
  name: string;
  commonName: string;
  ttl: string;
  subjectAlternativeNames: string[];
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
};

export type TUpdatePkiSubscriberDTO = {
  subscriberName: string;
  projectId: string;
  caId?: string;
  name?: string;
  commonName?: string;
  status?: PkiSubscriberStatus;
  ttl?: string;
  subjectAlternativeNames?: string[];
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
};

export type TDeletePkiSubscriberDTO = {
  subscriberName: string;
  projectId: string;
};

export type TIssuePkiSubscriberCertDTO = {
  subscriberName: string;
  projectId: string;
};
