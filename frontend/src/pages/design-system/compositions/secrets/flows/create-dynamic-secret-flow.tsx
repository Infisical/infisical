import { DynamicSecretFlow, type DynamicSecretResource } from "./dynamic-secret-flow";
import { environmentLabel, LOCAL_ONLY } from "./shared";
import type { AddFlowProps } from "./types";

export function CreateDynamicSecretFlow({
  open,
  onOpenChange,
  scope,
  resources,
  onCreate,
  onError
}: AddFlowProps) {
  const create = (batch: DynamicSecretResource[]) => {
    const taken = (entry: DynamicSecretResource) =>
      resources.some(
        (resource) =>
          resource.kind === "dynamic" &&
          resource.project === entry.project &&
          resource.environment === entry.environment &&
          resource.path === entry.path &&
          resource.name === entry.name
      );
    const duplicates = batch.filter(taken);
    const created = batch.filter((entry) => !taken(entry));
    if (created.length)
      onCreate(
        created.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...entry }) => entry),
        {
          title:
            created.length === 1
              ? `Created ${created[0].name}`
              : `Created ${created.length} dynamic secrets`,
          description: LOCAL_ONLY
        }
      );
    if (!duplicates.length) return true;
    onError({
      title: created.length
        ? `Created ${created.length} of ${batch.length} dynamic secrets. Review the created secrets before retrying failed items.`
        : "Dynamic secret was not created",
      description: duplicates
        .map(
          (entry) =>
            `A dynamic secret named ${entry.name} already exists in ${environmentLabel(entry.environment)} at ${entry.path}.`
        )
        .join(" ")
    });
    return false;
  };
  return (
    <DynamicSecretFlow
      open={open}
      onOpenChange={onOpenChange}
      project={scope.project}
      environments={scope.environments}
      secretPath={scope.path}
      onCreate={create}
    />
  );
}
