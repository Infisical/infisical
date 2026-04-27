import { PamDomainType } from "./enums";

export const PAM_DOMAIN_TYPE_MAP: Record<PamDomainType, { name: string; image: string }> = {
  [PamDomainType.ActiveDirectory]: {
    name: "Active Directory",
    image: "ActiveDirectory.png"
  }
};
