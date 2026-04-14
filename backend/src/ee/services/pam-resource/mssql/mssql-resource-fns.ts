import { MsSQLResourceListItemSchema } from "./mssql-resource-schemas";

export const getMsSQLResourceListItem = () => {
  return {
    name: MsSQLResourceListItemSchema.shape.name.value,
    resource: MsSQLResourceListItemSchema.shape.resource.value
  };
};
