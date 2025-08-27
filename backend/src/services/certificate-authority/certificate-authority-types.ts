import { TAcmeCertificateAuthority, TAcmeCertificateAuthorityInput } from "./acme/acme-certificate-authority-types";
import {
  TAzureAdCsCertificateAuthority,
  TAzureAdCsCertificateAuthorityInput
} from "./azure-ad-cs/azure-ad-cs-certificate-authority-types";
import { CaType } from "./certificate-authority-enums";
import {
  TInternalCertificateAuthority,
  TInternalCertificateAuthorityInput
} from "./internal/internal-certificate-authority-types";

export type TCertificateAuthority =
  | TInternalCertificateAuthority
  | TAcmeCertificateAuthority
  | TAzureAdCsCertificateAuthority;

export type TCertificateAuthorityInput =
  | TInternalCertificateAuthorityInput
  | TAcmeCertificateAuthorityInput
  | TAzureAdCsCertificateAuthorityInput;

export type TCreateCertificateAuthorityDTO = Omit<TCertificateAuthority, "id">;

export type TUpdateCertificateAuthorityDTO = Partial<Omit<TCreateCertificateAuthorityDTO, "projectId">> & {
  type: CaType;
  caName: string;
  projectId: string;
};
