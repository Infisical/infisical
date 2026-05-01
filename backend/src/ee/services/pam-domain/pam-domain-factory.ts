import { TPamAccountCredentials } from "../pam-resource/pam-resource-types";
import { activeDirectoryDomainFactory } from "./active-directory/active-directory-domain-factory";
import { PamDomainType } from "./pam-domain-enums";
import { TPamDomainConnectionDetails, TPamDomainFactory } from "./pam-domain-types";

type TPamDomainFactoryImplementation = TPamDomainFactory<TPamDomainConnectionDetails, TPamAccountCredentials>;

export const PAM_DOMAIN_FACTORY_MAP: Record<PamDomainType, TPamDomainFactoryImplementation> = {
  [PamDomainType.ActiveDirectory]: activeDirectoryDomainFactory as TPamDomainFactoryImplementation
};
