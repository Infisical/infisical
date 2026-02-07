import { WindowsResourceListItemSchema } from "./windows-server-resource-schemas";

export const getWindowsResourceListItem = () => {
  return {
    name: WindowsResourceListItemSchema.shape.name.value,
    resource: WindowsResourceListItemSchema.shape.resource.value
  };
};
