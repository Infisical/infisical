import { OracleResourceListItemSchema } from "./oracle-resource-schemas";

export const getOracleResourceListItem = () => {
  return {
    name: OracleResourceListItemSchema.shape.name.value,
    resource: OracleResourceListItemSchema.shape.resource.value
  };
};
