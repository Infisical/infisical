import { type ReactNode, useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Select } from "@app/components/v4/ui/select";
import { SmallText } from "@app/components/v4/ui/text";

import type { Resource } from "../../secrets-model";
import { childPath, LOCAL_ONLY } from "../flows/shared";
import type { EnvironmentOption, FlowFeedback, FlowScope } from "../flows/types";
import type { RowActionTone } from "./types";

import styles from "./folder-actions.module.css";

export type FolderMove = { environment: string; destinationEnvironment: string };

type Folder = Extract<Resource, { kind: "folder" }>;
type BlockingType = "secret_import" | "dynamic_secret" | "honey_token" | "secret_rotation";
type MoveResult = {
  id: string;
  name: string;
  status: "success" | "info" | "error";
  message: string;
};

const BLOCKING_KINDS: { kind: Resource["kind"]; type: BlockingType }[] = [
  { kind: "import", type: "secret_import" },
  { kind: "dynamic", type: "dynamic_secret" },
  { kind: "honey", type: "honey_token" },
  { kind: "rotation", type: "secret_rotation" }
];
const SELF_MOVE_REASON = "Folders can't be moved into themselves or their subfolders";
const RESULT_ICONS = { success: "check-c", info: "info", error: "alert-c" } as const;

const folderNameRegex = /^[a-zA-Z0-9-_]+$/;
const stripLeadingSlashes = (path: string) => path.replace(/^\/+/, "");
const normalizeFolderPathInput = (path: string) => stripLeadingSlashes(path).replace(/\s+/g, "-");
const getPathSegments = (path: string) => stripLeadingSlashes(path.trim()).split("/");
const getAbsolutePath = (path: string) => {
  const pathWithoutRoot = stripLeadingSlashes(path.trim());
  return pathWithoutRoot ? `/${pathWithoutRoot}` : "/";
};
const isValidFolderPath = (path: string) =>
  getPathSegments(path).every(
    (segment) => segment.length > 0 && segment.length <= 255 && folderNameRegex.test(segment)
  );
export const isPathInsideFolder = (destinationPath: string, folderPath: string) =>
  destinationPath === folderPath || destinationPath.startsWith(`${folderPath}/`);

const formatFolderMoveBlock = (blockingType: BlockingType, blockingPath: string) => {
  const at = ` at "${blockingPath}"`;
  switch (blockingType) {
    case "secret_rotation":
      return `A secret rotation exists${at}. Delete the rotation to move this folder.`;
    case "dynamic_secret":
      return `A dynamic secret exists${at}. Delete the dynamic secret to move this folder.`;
    case "honey_token":
      return `A honey token exists${at}. Delete the honey token to move this folder.`;
    case "secret_import":
    default:
      return `A secret import exists${at}. Remove the import to move this folder.`;
  }
};

export const moveFolderResources = (
  current: Resource[],
  folder: Pick<Folder, "project" | "path" | "name">,
  moves: FolderMove[],
  destinationPath: string
) => {
  const folderPath = childPath(folder.path, folder.name);
  const target = childPath(destinationPath, folder.name);
  return current.map((resource) => {
    const move = moves.find((entry) => entry.environment === resource.environment);
    if (!move || resource.project !== folder.project) return resource;
    const isRoot =
      resource.kind === "folder" && resource.path === folder.path && resource.name === folder.name;
    if (!isRoot && !isPathInsideFolder(resource.path, folderPath)) return resource;
    const environment = move.destinationEnvironment;
    const path = isRoot ? destinationPath : `${target}${resource.path.slice(folderPath.length)}`;
    return {
      ...resource,
      environment,
      path,
      id: `${resource.project}:${environment}:${path}:${resource.kind}:${resource.name}`,
      updatedAt: new Date().toISOString()
    };
  });
};

function MoveLocationLayout({
  sourceEnvironment,
  sourcePath,
  destinationEnvironment,
  destinationPath
}: {
  sourceEnvironment: string;
  sourcePath: string;
  destinationEnvironment: ReactNode;
  destinationPath: ReactNode;
}) {
  return (
    <div className={styles.location}>
      <div className={styles.locationRow} role="group" aria-label="Source location">
        <Input readOnly aria-label="Source environment" value={sourceEnvironment} />
        <Input readOnly mono icon="folder" aria-label="Source folder" value={sourcePath} />
      </div>
      <div className={styles.moveTo} aria-hidden>
        <span className={styles.rule} />
        <span className={styles.moveToLabel}>Move to</span>
        <span className={styles.rule} />
      </div>
      <div className={styles.locationRow} role="group" aria-label="Destination location">
        {destinationEnvironment}
        {destinationPath}
      </div>
    </div>
  );
}

export function FolderMoveDialog({
  open,
  folder,
  scope,
  resources,
  foldersWithRbacPolicies,
  onClose,
  onApply,
  onToast,
  onMoved
}: {
  open: boolean;
  folder: Folder;
  scope: FlowScope;
  resources: readonly Resource[];
  foldersWithRbacPolicies: string[];
  onClose: () => void;
  onApply: (update: (current: Resource[]) => Resource[], feedback: FlowFeedback) => void;
  onToast: (tone: RowActionTone, feedback: FlowFeedback) => void;
  onMoved: (moves: FolderMove[], from: string, to: string) => void;
}) {
  const { environments } = scope;
  const sourcePath = folder.path;
  const folderPath = childPath(sourcePath, folder.name);
  const isSingleEnvMode = scope.visibleEnvironments.length === 1;
  const sourceEnv = scope.visibleEnvironments[0];
  const [destinationEnv, setDestinationEnv] = useState(sourceEnv.value);
  const [selectedPath, setSelectedPath] = useState("/");
  const [createError, setCreateError] = useState<string>();
  const [results, setResults] = useState<MoveResult[]>();

  const foldersByEnv = new Set(
    environments
      .filter(({ value }) =>
        resources.some(
          (resource) =>
            resource.kind === "folder" &&
            resource.project === folder.project &&
            resource.environment === value &&
            resource.path === sourcePath &&
            resource.name === folder.name
        )
      )
      .map(({ value }) => value)
  );

  const subtree = resources.filter(
    (resource) =>
      resource.project === folder.project &&
      foldersByEnv.has(resource.environment) &&
      isPathInsideFolder(resource.path, folderPath)
  );
  const blocked = BLOCKING_KINDS.map(({ kind, type }) => ({
    type,
    resource: subtree.find((resource) => resource.kind === kind)
  })).find(({ resource }) => resource);

  const moves: FolderMove[] = isSingleEnvMode
    ? [sourceEnv.value]
        .filter((value) => foldersByEnv.has(value))
        .map((environment) => ({ environment, destinationEnvironment: destinationEnv }))
    : [...foldersByEnv].map((environment) => ({
        environment,
        destinationEnvironment: environment
      }));
  const isCandidateBlocked = (candidate: string) =>
    moves.some(
      ({ environment, destinationEnvironment }) =>
        environment === destinationEnvironment && isPathInsideFolder(candidate, folderPath)
    );

  const pathEnvironments = isSingleEnvMode
    ? environments.filter(({ value }) => value === destinationEnv)
    : environments;
  const creationEnvironments: EnvironmentOption[] = isSingleEnvMode
    ? pathEnvironments
    : environments.filter(({ value }) => foldersByEnv.has(value));
  const pathSets = new Map(
    pathEnvironments.map(({ value }) => [
      value,
      new Set(
        resources
          .filter(
            (resource) =>
              resource.kind === "folder" &&
              resource.project === folder.project &&
              resource.environment === value
          )
          .map((resource) => childPath(resource.path, resource.name))
      )
    ])
  );
  const options = [
    "/",
    ...[...new Set([...pathSets.values()].flatMap((paths) => [...paths]))]
      .filter((path) =>
        creationEnvironments.every(({ value }) => pathSets.get(value)?.has(path) ?? false)
      )
      .sort((left, right) => left.localeCompare(right))
  ].map((path) => {
    const disabled = isCandidateBlocked(path);
    return { value: path, label: path, disabled, meta: disabled ? SELF_MOVE_REASON : undefined };
  });

  const destinationSelected =
    Boolean(selectedPath) &&
    (sourcePath !== selectedPath || (isSingleEnvMode && destinationEnv !== sourceEnv.value));
  const isSelfMove = destinationSelected && isCandidateBlocked(selectedPath);

  const createPath = (query: string) => {
    const inputPath = normalizeFolderPathInput(query);
    const candidatePath = getAbsolutePath(inputPath);
    const segments = getPathSegments(inputPath);
    const missing = creationEnvironments
      .map((environment) => ({
        environment,
        paths: segments
          .map((_, index) => `/${segments.slice(0, index + 1).join("/")}`)
          .filter((path) => !pathSets.get(environment.value)?.has(path))
      }))
      .filter(({ paths }) => paths.length > 0);
    let reason: string | undefined;
    if (creationEnvironments.length === 0)
      reason = "No selected environments can create this folder";
    else if (!inputPath.trim()) reason = "Type a new folder name";
    else if (!isValidFolderPath(inputPath))
      reason = "Folder names can only contain letters, numbers, dashes, and underscores";
    else if (isCandidateBlocked(candidatePath)) reason = SELF_MOVE_REASON;
    else if (missing.length === 0) reason = "This folder already exists";
    if (reason) {
      setCreateError(reason);
      return;
    }
    const now = new Date().toISOString();
    const created: Folder[] = missing.flatMap(({ environment, paths }) =>
      paths.map((segmentPath) => {
        const parts = segmentPath.split("/").filter(Boolean);
        const path = `/${parts.slice(0, -1).join("/")}`;
        const name = parts.at(-1) ?? "";
        return {
          kind: "folder",
          project: folder.project,
          environment: environment.value,
          path,
          name,
          description: "",
          id: `${folder.project}:${environment.value}:${path}:folder:${name}`,
          createdAt: now,
          updatedAt: now
        };
      })
    );
    onApply((current) => [...current, ...created], {
      title: `Created ${candidatePath} in ${missing
        .map(({ environment }) => environment.label)
        .join(", ")}`,
      description: LOCAL_ONLY
    });
    setCreateError(undefined);
    setSelectedPath(candidatePath);
  };

  const conflictIn = (environment: string) =>
    resources.some(
      (resource) =>
        resource.kind === "folder" &&
        resource.project === folder.project &&
        resource.environment === environment &&
        resource.path === selectedPath &&
        resource.name === folder.name
    );
  const conflictMessage = (environment: string) =>
    `A folder named '${folder.name}' already exists at path '${selectedPath}' in environment '${environment}'`;

  const submit = () => {
    if (isSingleEnvMode) {
      const [move] = moves;
      if (!move) {
        onToast("neutral", { title: "Nothing selected to move in this environment" });
        return;
      }
      if (conflictIn(move.destinationEnvironment)) {
        onToast("bad", {
          title: `Failed to move 1 folder: ${folder.name}`,
          description: conflictMessage(move.destinationEnvironment)
        });
        onClose();
        return;
      }
      onApply((current) => moveFolderResources(current, folder, [move], selectedPath), {
        title: "Successfully moved 1 folder",
        description: LOCAL_ONLY
      });
      onMoved([move], folderPath, childPath(selectedPath, folder.name));
      onClose();
      return;
    }
    const applied: FolderMove[] = [];
    const nextResults = environments.map((environment): MoveResult => {
      const name = `${environment.label} / ${folder.name}`;
      const id = `${environment.value}-folder`;
      if (!foldersByEnv.has(environment.value))
        return {
          id: environment.value,
          name: environment.label,
          status: "info",
          message: "The selected folder isn't in this environment."
        };
      if (conflictIn(environment.value))
        return { id, name, status: "error", message: conflictMessage(environment.value) };
      applied.push({ environment: environment.value, destinationEnvironment: environment.value });
      return { id, name, status: "success", message: "Folder moved." };
    });
    if (applied.length) {
      onApply((current) => moveFolderResources(current, folder, applied, selectedPath), {
        title: `Moved ${folder.name} in ${applied.length} environment${applied.length === 1 ? "" : "s"}`,
        description: LOCAL_ONLY
      });
      onMoved(applied, folderPath, childPath(selectedPath, folder.name));
    }
    setResults(nextResults);
  };

  let description = isSingleEnvMode
    ? "Move the selected folders to another project location."
    : "Move the selected folders to the same folder location across environments.";
  if (results) description = "Review what happened in each environment.";

  const renderBody = () => {
    if (results)
      return (
        <ul className={styles.results}>
          {results.map(({ id, name, status, message }) => (
            <li key={id} className={styles.result} data-status={status}>
              <Icon name={RESULT_ICONS[status]} className={styles.resultIcon} />
              <div className={styles.resultText}>
                <span className={styles.resultName}>{name}</span>
                <SmallText muted>{message}</SmallText>
              </div>
            </li>
          ))}
        </ul>
      );
    if (blocked?.resource)
      return (
        <Alert tone="bad" title="This folder can't be moved">
          <ul className={styles.bullets}>
            <li>{formatFolderMoveBlock(blocked.type, blocked.resource.path)}</li>
          </ul>
        </Alert>
      );
    return (
      <div className={styles.stack}>
        <div className={styles.stackTight}>
          <MoveLocationLayout
            sourceEnvironment={
              isSingleEnvMode ? sourceEnv.label : `${environments.length} environments`
            }
            sourcePath={sourcePath}
            destinationEnvironment={
              isSingleEnvMode ? (
                <Select
                  aria-label="Destination environment"
                  placeholder="Environment..."
                  value={destinationEnv}
                  options={environments}
                  onChange={(value) => {
                    setDestinationEnv(value);
                    setSelectedPath("/");
                    setCreateError(undefined);
                  }}
                />
              ) : (
                <Input readOnly aria-label="Destination environments" value="Same environments" />
              )
            }
            destinationPath={
              <Field error={createError}>
                <Combobox
                  label="Destination folder"
                  mono
                  options={options}
                  value={selectedPath}
                  placeholder="Select a destination folder..."
                  emptyText="No folders found. Type a path to create one."
                  invalid={Boolean(createError)}
                  onValueChange={(value) => {
                    setSelectedPath(value);
                    setCreateError(undefined);
                  }}
                  onCreate={createPath}
                />
              </Field>
            }
          />
          {!isSingleEnvMode && (
            <SmallText muted>This will create one commit per selected environment.</SmallText>
          )}
        </div>
        {isSelfMove && (
          <Alert tone="bad" title="This move is not allowed">
            You cannot move a folder into itself or one of its own subfolders.
          </Alert>
        )}
        {foldersWithRbacPolicies.length > 0 && (
          <Alert tone="warn" title="Folder permissions will move with this folder">
            {`Folder-specific permissions are granted on ${foldersWithRbacPolicies
              .map((name) => `"${name}"`)
              .join(
                ", "
              )} or one of its subfolders. Users and identities with this access will keep it at the new location.`}
          </Alert>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={styles.moveDialog}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{results ? "Move summary" : "Move folders"}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {renderBody()}
        <DialogFooter>
          {results || blocked?.resource ? (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!destinationSelected || isSelfMove} onClick={submit}>
                Move folders
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
