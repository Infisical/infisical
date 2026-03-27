import { SSHResourceListItemSchema } from "./ssh-resource-schemas";

export const getSshResourceListItem = () => {
  return {
    name: SSHResourceListItemSchema.shape.name.value,
    resource: SSHResourceListItemSchema.shape.resource.value
  };
};
