import { activeDirectoryDiscoveryFactory } from "./active-directory/active-directory-discovery-factory";
import { PamDiscoveryType } from "./pam-discovery-enums";
import { TPamDiscoveryFactory } from "./pam-discovery-types";

export const PAM_DISCOVERY_FACTORY_MAP: Record<PamDiscoveryType, TPamDiscoveryFactory> = {
  [PamDiscoveryType.ActiveDirectory]: activeDirectoryDiscoveryFactory
};
