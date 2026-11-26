import { useEffect, useState } from "react";

import { type Dependent, useDependents } from "../row-actions/references-dialog";
import { draftKey, type UnsavedChange } from "./unsaved-edits";

function DependentsProbe({
  project,
  change,
  onResult
}: {
  project: string;
  change: UnsavedChange;
  onResult: (key: string, dependents: Dependent[]) => void;
}) {
  const { dependents, isPending } = useDependents({
    project,
    environment: change.environment,
    path: change.secretPath,
    name: change.secretKey
  });
  useEffect(() => {
    if (!isPending)
      onResult(draftKey(change.environment, change.secretPath, change.secretKey), dependents);
  }, [isPending, dependents.length]);
  return null;
}

export function DependentsLookup({
  project,
  changes,
  onDone
}: {
  project: string;
  changes: UnsavedChange[];
  onDone: (dependents: Dependent[]) => void;
}) {
  const [results, setResults] = useState<Record<string, Dependent[]>>({});
  const keys = changes.map((change) =>
    draftKey(change.environment, change.secretPath, change.secretKey)
  );
  const settled = keys.every((key) => key in results);
  useEffect(() => {
    if (!settled) return;
    onDone([
      ...new Map(
        keys
          .flatMap((key) => results[key])
          .map((dependent) => [
            `${dependent.environment} ${dependent.path} ${dependent.name}`,
            dependent
          ])
      ).values()
    ]);
  }, [settled]);
  return changes.map((change, index) => (
    <DependentsProbe
      key={keys[index]}
      project={project}
      change={change}
      onResult={(key, dependents) =>
        setResults((current) => (key in current ? current : { ...current, [key]: dependents }))
      }
    />
  ));
}
