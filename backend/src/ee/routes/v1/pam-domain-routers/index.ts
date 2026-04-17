import { registerPamAccountEndpoints } from "@app/ee/routes/v1/pam-account-routers/pam-account-endpoints";
import {
  CreateActiveDirectoryAccountSchema,
  SanitizedActiveDirectoryAccountWithDomainSchema,
  UpdateActiveDirectoryAccountSchema
} from "@app/ee/services/pam-domain/active-directory/active-directory-domain-schemas";
import { PamDomainType } from "@app/ee/services/pam-domain/pam-domain-enums";
import {
  CreateActiveDirectoryDomainSchema,
  SanitizedActiveDirectoryDomainSchema,
  UpdateActiveDirectoryDomainSchema
} from "@app/ee/services/pam-domain/pam-domain-schemas";

import { registerActiveDirectoryRelatedResourcesEndpoint, registerPamDomainEndpoints } from "./pam-domain-endpoints";

export { registerPamDomainRouter } from "./pam-domain-router";

export const PAM_DOMAIN_REGISTER_ROUTER_MAP: Record<PamDomainType, (server: FastifyZodProvider) => Promise<void>> = {
  [PamDomainType.ActiveDirectory]: async (server: FastifyZodProvider) => {
    registerPamDomainEndpoints({
      server,
      domainType: PamDomainType.ActiveDirectory,
      domainResponseSchema: SanitizedActiveDirectoryDomainSchema,
      createDomainSchema: CreateActiveDirectoryDomainSchema,
      updateDomainSchema: UpdateActiveDirectoryDomainSchema
    });
    registerActiveDirectoryRelatedResourcesEndpoint(server);
  }
};

export const PAM_DOMAIN_ACCOUNT_REGISTER_ROUTER_MAP: Record<
  PamDomainType,
  (server: FastifyZodProvider) => Promise<void>
> = {
  [PamDomainType.ActiveDirectory]: async (server: FastifyZodProvider) => {
    registerPamAccountEndpoints({
      server,
      parentType: PamDomainType.ActiveDirectory,
      accountResponseSchema: SanitizedActiveDirectoryAccountWithDomainSchema,
      createAccountSchema: CreateActiveDirectoryAccountSchema,
      updateAccountSchema: UpdateActiveDirectoryAccountSchema
    });
  }
};
