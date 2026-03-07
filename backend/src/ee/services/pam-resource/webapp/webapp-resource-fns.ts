import { WebAppResourceListItemSchema } from "./webapp-resource-schemas";

export const getWebAppResourceListItem = () => {
  return {
    name: WebAppResourceListItemSchema.shape.name.value,
    resource: WebAppResourceListItemSchema.shape.resource.value
  };
};
