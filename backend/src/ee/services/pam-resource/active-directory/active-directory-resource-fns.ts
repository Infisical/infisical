import { ActiveDirectoryResourceListItemSchema } from "./active-directory-resource-schemas";

export const getActiveDirectoryResourceListItem = () => {
  return {
    name: ActiveDirectoryResourceListItemSchema.shape.name.value,
    resource: ActiveDirectoryResourceListItemSchema.shape.resource.value
  };
};
