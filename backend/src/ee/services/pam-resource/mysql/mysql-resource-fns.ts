import { MySQLResourceListItemSchema } from "./mysql-resource-schemas";

export const getPostgresResourceListItem = () => {
  return {
    name: MySQLResourceListItemSchema.shape.name.value,
    resource: MySQLResourceListItemSchema.shape.resource.value
  };
};
