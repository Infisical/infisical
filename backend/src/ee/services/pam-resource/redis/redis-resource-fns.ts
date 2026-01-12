import { RedisResourceListItemSchema } from "./redis-resource-schemas";

export const getRedisResourceListItem = () => {
  return {
    name: RedisResourceListItemSchema.shape.name.value,
    resource: RedisResourceListItemSchema.shape.resource.value
  };
};
