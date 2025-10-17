import { MySQLResourceListItemSchema } from "./mysql-resource-schemas";

export const getMySQLResourceListItem = () => {
  return {
    name: MySQLResourceListItemSchema.shape.name.value,
    resource: MySQLResourceListItemSchema.shape.resource.value
  };
};
