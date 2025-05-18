import { CaType } from "./certificate-authority-enums";

export const CERTIFICATE_AUTHORITIES_TYPE_MAP: Record<CaType, string> = {
  [CaType.INTERNAL]: "Internal",
  [CaType.ACME]: "ACME"
};
