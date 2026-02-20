import { ActiveDirectoryDiscoveryListItemSchema } from "./active-directory-discovery-schemas";

export const getActiveDirectorySourceListItem = () => {
  return {
    name: ActiveDirectoryDiscoveryListItemSchema.shape.name.value,
    discoveryType: ActiveDirectoryDiscoveryListItemSchema.shape.discoveryType.value
  };
};
