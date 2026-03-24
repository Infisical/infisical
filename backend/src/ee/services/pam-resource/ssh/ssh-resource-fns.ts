import { SSHResourceListItemSchema } from "./ssh-resource-schemas";

export const getSSHResourceListItem = () => {
  return {
    name: SSHResourceListItemSchema.shape.name.value,
    resource: SSHResourceListItemSchema.shape.resource.value
  };
};
