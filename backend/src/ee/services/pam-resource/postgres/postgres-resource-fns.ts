import { PostgresResourceListItemSchema } from "./postgres-resource-schemas";

export const getPostgresResourceListItem = () => {
  return {
    name: PostgresResourceListItemSchema.shape.name.value,
    resource: PostgresResourceListItemSchema.shape.resource.value
  };
};
