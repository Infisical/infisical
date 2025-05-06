import { CertExtendedKeyUsage, CertKeyUsage } from "../certificates/enums";

export type TPkiSubscriber = {
  id: string;
  projectId: string;
  caId: string;
  name: string;
  commonName: string;
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
  subscriberId: string;
  caId?: string;
  name?: string;
  commonName?: string;
  ttl?: string;
  subjectAlternativeNames?: string[];
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
};

export type TDeletePkiSubscriberDTO = {
  subscriberId: string;
};
