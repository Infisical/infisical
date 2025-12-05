import { KubernetesResourceListItemSchema } from "./kubernetes-resource-schemas";

export const getKubernetesResourceListItem = () => {
  return {
    name: KubernetesResourceListItemSchema.shape.name.value,
    resource: KubernetesResourceListItemSchema.shape.resource.value
  };
};
