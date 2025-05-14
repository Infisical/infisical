import { CaType } from "./certificate-authority-enums";
import {
  TInternalCertificateAuthority,
  TInternalCertificateAuthorityInput
} from "./internal/internal-certificate-authority-types";

export type TCertificateAuthority = TInternalCertificateAuthority;

export type TCertificateAuthorityInput = TInternalCertificateAuthorityInput;

export type TCreateCertificateAuthorityDTO = Omit<TCertificateAuthority, "type" | "id"> & {
  type: CaType;
};

export type TUpdateCertificateAuthorityDTO = Partial<Omit<TCreateCertificateAuthorityDTO, "projectId">> & {
  type: CaType;
  id: string;
};
