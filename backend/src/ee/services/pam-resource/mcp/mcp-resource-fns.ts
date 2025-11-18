import { McpResourceListItemSchema } from "./mcp-resource-schemas";

export const getMcpResourceListItem = () => {
  return {
    name: McpResourceListItemSchema.shape.name.value,
    resource: McpResourceListItemSchema.shape.resource.value
  };
};
