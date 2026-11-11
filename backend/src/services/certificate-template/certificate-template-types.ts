import { TActorInput } from "@app/lib/types";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";

export type TCreateCertTemplateDTO = {
  caId: string;
  pkiCollectionId?: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
} & TActorInput;

export type TUpdateCertTemplateDTO = {
  id: string;
  caId?: string;
  pkiCollectionId?: string;
  name?: string;
  commonName?: string;
  subjectAlternativeName?: string;
  ttl?: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
} & TActorInput;

export type TGetCertTemplateDTO = {
  id: string;
} & TActorInput;

export type TDeleteCertTemplateDTO = {
  id: string;
} & TActorInput;

export type TCreateEstConfigurationDTO = {
  certificateTemplateId: string;
  caChain?: string;
  passphrase: string;
  isEnabled: boolean;
  disableBootstrapCertValidation: boolean;
} & TActorInput;

export type TUpdateEstConfigurationDTO = {
  certificateTemplateId: string;
  caChain?: string;
  passphrase?: string;
  isEnabled?: boolean;
  disableBootstrapCertValidation?: boolean;
} & TActorInput;

export type TGetEstConfigurationDTO =
  | {
      isInternal: true;
      certificateTemplateId: string;
    }
  | ({
      isInternal: false;
      certificateTemplateId: string;
    } & TActorInput);
