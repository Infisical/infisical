import {
  ActiveDirectoryDiscoverySourceRunSchema,
  CreateActiveDirectoryDiscoverySourceSchema,
  SanitizedActiveDirectoryDiscoverySourceSchema,
  UpdateActiveDirectoryDiscoverySourceSchema
} from "@app/ee/services/pam-discovery/active-directory/active-directory-discovery-schemas";
import { PamDiscoveryType } from "@app/ee/services/pam-discovery/pam-discovery-enums";

import { registerPamDiscoveryEndpoints } from "./pam-discovery-endpoints";

export const PAM_DISCOVERY_REGISTER_ROUTER_MAP: Record<
  PamDiscoveryType,
  (server: FastifyZodProvider) => Promise<void>
> = {
  [PamDiscoveryType.ActiveDirectory]: async (server: FastifyZodProvider) => {
    registerPamDiscoveryEndpoints({
      server,
      discoveryType: PamDiscoveryType.ActiveDirectory,
      createDiscoverySourceSchema: CreateActiveDirectoryDiscoverySourceSchema,
      updateDiscoverySourceSchema: UpdateActiveDirectoryDiscoverySourceSchema,
      discoveryResponseSchema: SanitizedActiveDirectoryDiscoverySourceSchema,
      discoveryRunResponseSchema: ActiveDirectoryDiscoverySourceRunSchema
    });
  }
};
