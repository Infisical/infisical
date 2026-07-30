import { activeDirectoryDiscoveryFactory } from "./active-directory/active-directory-discovery-factory";
import { PamDiscoveryType } from "./pam-discovery-enums";
import { TPamDiscoveryFactory } from "./pam-discovery-types";
import { unixDiscoveryFactory } from "./unix/unix-discovery-factory";

export const PAM_DISCOVERY_FACTORY_MAP: Record<PamDiscoveryType, TPamDiscoveryFactory> = {
  [PamDiscoveryType.ActiveDirectory]: activeDirectoryDiscoveryFactory,
  [PamDiscoveryType.Unix]: unixDiscoveryFactory
};
