import { useState } from "react";

import {
  type FolderMove,
  isPathInsideFolder,
  MoveSecretsDialog
} from "../bulk/move-secrets-dialog";
import { childPath, LOCAL_ONLY } from "../flows/shared";
import { createAccessState, FolderAccessSheet, grantKey } from "./folder-access-sheet";
import type { RowActionHostProps } from "./types";

export function FolderActions({
  action,
  onClose,
  scope,
  resources,
  onApply,
  onToast
}: RowActionHostProps<"folder">) {
  const [access, setAccess] = useState(createAccessState);
  const [last, setLast] = useState(action);
  const [session, setSession] = useState(0);
  if (action && action !== last) {
    setLast(action);
    setSession(session + 1);
  }
  if (!last) return null;

  const folderPath = childPath(last.entry.path, last.entry.name);
  const grantsUnder = (environment: string) =>
    Object.entries(access.grants).some(([key, grants]) => {
      const [grantEnvironment, ...rest] = key.split(":");
      return (
        grantEnvironment === environment &&
        isPathInsideFolder(rest.join(":"), folderPath) &&
        Object.keys(grants).length > 0
      );
    });
  const remapGrants = (moves: FolderMove[]) =>
    setAccess((current) => ({
      ...current,
      grants: Object.fromEntries(
        Object.entries(current.grants).map(([key, grants]) => {
          const [environment, ...rest] = key.split(":");
          const path = rest.join(":");
          const move = moves.find(
            (entry) => entry.environment === environment && isPathInsideFolder(path, entry.from)
          );
          if (!move) return [key, grants];
          return [
            grantKey(move.destinationEnvironment, `${move.to}${path.slice(move.from.length)}`),
            grants
          ];
        })
      )
    }));

  if (last.action === "move")
    return (
      <MoveSecretsDialog
        key={session}
        open={action?.action === "move"}
        targets={last.entries}
        scope={scope}
        resources={resources}
        foldersWithRbacPolicies={
          scope.environments.some(({ value }) => grantsUnder(value)) ? [last.entry.name] : []
        }
        onClose={onClose}
        onApply={onApply}
        onToast={onToast}
        onFoldersMoved={remapGrants}
      />
    );

  const environment = scope.visibleEnvironments[0];
  return (
    <FolderAccessSheet
      key={session}
      open={action?.action === "access"}
      state={access}
      environmentSlug={environment.value}
      environmentName={environment.label}
      folderPath={folderPath}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onChange={setAccess}
      onSuccess={(title) => onToast("ok", { title, description: LOCAL_ONLY })}
    />
  );
}
