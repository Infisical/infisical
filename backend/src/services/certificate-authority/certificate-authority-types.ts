import { TAcmeCertificateAuthority, TAcmeCertificateAuthorityInput } from "./acme/acme-certificate-authority-types";
import { CaType } from "./certificate-authority-enums";
import {
  TInternalCertificateAuthority,
  TInternalCertificateAuthorityInput
} from "./internal/internal-certificate-authority-types";

export type TCertificateAuthority = TInternalCertificateAuthority | TAcmeCertificateAuthority;

export type TCertificateAuthorityInput = TInternalCertificateAuthorityInput | TAcmeCertificateAuthorityInput;

export type TCreateCertificateAuthorityDTO = Omit<TCertificateAuthority, "id">;

export type TUpdateCertificateAuthorityDTO = Partial<Omit<TCreateCertificateAuthorityDTO, "projectId">> & {
  type: CaType;
  caName: string;
  projectId: string;
};
