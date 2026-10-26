import { type RotationResource, SecretRotationFlow } from "./secret-rotation-flow";
import type { AddFlowProps, NewResource } from "./types";

export function CreateSecretRotationFlow({
  open,
  onOpenChange,
  scope,
  resources,
  onCreate
}: AddFlowProps) {
  const create = ({
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rotation
  }: RotationResource) => {
    const at = {
      project: rotation.project,
      environment: rotation.environment,
      path: rotation.path
    };
    const secrets: NewResource[] = rotation.managedKeys.map((key) => ({
      ...at,
      kind: "secret",
      name: key,
      value: {
        status: "present",
        value: `fake-${key.toLowerCase().replace(/_/g, "-")}-${rotation.environment}`
      },
      comment: "",
      tags: [],
      metadata: [],
      version: 1,
      managedBy: rotation.name
    }));
    onCreate([rotation, ...secrets], {
      title: `Created ${rotation.name} locally`,
      description: `Fake values for ${rotation.managedKeys.join(", ")}. No credentials were issued.`
    });
  };
  return (
    <SecretRotationFlow
      open={open}
      onOpenChange={onOpenChange}
      project={scope.project}
      environments={scope.environments}
      secretPath={scope.path}
      resources={[...resources]}
      onCreate={create}
    />
  );
}
