import { MongoDBResourceListItemSchema } from "./mongodb-resource-schemas";

export const getMongoDBResourceListItem = () => {
  return {
    name: MongoDBResourceListItemSchema.shape.name.value,
    resource: MongoDBResourceListItemSchema.shape.resource.value
  };
};
