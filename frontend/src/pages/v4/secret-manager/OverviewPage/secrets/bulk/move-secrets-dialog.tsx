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
import { FieldError } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Select } from "@app/components/v4/ui/select";
import { Switch } from "@app/components/v4/ui/switch";
import { SmallText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import type { Resource, Secret } from "../../secrets-model";
import { childPath, Gate } from "../flows/shared";
import type { ApplyFeedback, EnvironmentOption, FlowFeedback } from "../flows/types";
import { useManagedBlock } from "../row-actions/permissions";
import type { OverlayHostProps } from "../row-actions/types";
import {
  isPathInsideFolder,
  moveFolderResources,
  planSecretMove,
  relocate
} from "./move-resources";

import styles from "./bulk-dialogs.module.css";

export { isPathInsideFolder, moveFolderResources } from "./move-resources";

type Of<K extends Resource["kind"]> = Extract<Resource, { kind: K }>;
type Folder = Of<"folder">;
type Rotation = Of<"rotation">;
type BlockingType = "secret_import" | "dynamic_secret" | "honey_token" | "secret_rotation";
type MoveResult = {
  id: string;
  name: string;
  status: "success" | "info" | "error";
  message: string;
};
type Step = (current: Resource[]) => { next: Resource[] } | { error: string };
type MovedFolder = { name: string; sourceEnv: string; destinationEnvironment: string };

export type FolderMove = {
  environment: string;
  destinationEnvironment: string;
  from: string;
  to: string;
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
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

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

type Props = OverlayHostProps & {
  targets?: Resource[];
  onCompleted?: () => void;
  open?: boolean;
  foldersWithRbacPolicies?: string[];
  onFoldersMoved?: (moves: FolderMove[]) => void;
};

function MoveSecretsDialogContent({
  open,
  targets,
  scope,
  resources,
  foldersWithRbacPolicies = [],
  onClose,
  onApply,
  onToast,
  onCompleted,
  onFoldersMoved
}: Props & { targets: Resource[]; open: boolean }) {
  const { environments, project } = scope;
  const sourcePath = targets[0]?.path ?? scope.path;
  const isSingleEnvMode = scope.visibleEnvironments.length === 1;
  const sourceEnv = scope.visibleEnvironments[0];
  const [destinationEnv, setDestinationEnv] = useState(sourceEnv.value);
  const [selectedPath, setSelectedPath] = useState("/");
  const blockFor = useManagedBlock(project);
  const moveBlock =
    blockFor(
      ProjectPermissionSub.Secrets,
      ProjectPermissionSecretActions.Delete,
      { environment: sourceEnv.value, secretPath: sourcePath },
      "move secrets out of this folder"
    ) ??
    blockFor(
      ProjectPermissionSub.Secrets,
      ProjectPermissionSecretActions.Create,
      { environment: destinationEnv, secretPath: selectedPath },
      "create secrets in this destination"
    );
  const [shouldOverwrite, setShouldOverwrite] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const [results, setResults] = useState<MoveResult[]>();

  const group = <K extends "secret" | "folder" | "rotation">(kind: K) => {
    const byName = new Map<string, Map<string, Of<K>>>();
    targets.forEach((resource) => {
      if (resource.kind !== kind) return;
      const perEnv = byName.get(resource.name) ?? new Map<string, Of<K>>();
      perEnv.set(resource.environment, resource as Of<K>);
      byName.set(resource.name, perEnv);
    });
    return byName;
  };
  const secrets = group("secret");
  const rotations = group("rotation");
  const folders = group("folder");

  const hasFolders = folders.size > 0;
  const hasSecretsOrRotations = secrets.size > 0 || rotations.size > 0;
  let title = "Move secrets";
  let noun = "secrets";
  if (hasFolders && !hasSecretsOrRotations) {
    title = "Move folders";
    noun = "folders";
  } else if (hasFolders) {
    title = "Move items";
    noun = "items";
  }

  const blockedFolders = [...folders.entries()].flatMap(([name, perEnv]) => {
    const folderPath = childPath(sourcePath, name);
    const subtree = resources.filter(
      (resource) =>
        resource.project === project &&
        perEnv.has(resource.environment) &&
        isPathInsideFolder(resource.path, folderPath)
    );
    const blocking = BLOCKING_KINDS.map(({ kind, type }) => ({
      type,
      resource: subtree.find((resource) => resource.kind === kind)
    })).find(({ resource }) => resource);
    return blocking?.resource
      ? [{ name, message: formatFolderMoveBlock(blocking.type, blocking.resource.path) }]
      : [];
  });

  const inEnvironment = <R extends Resource>(perName: Map<string, Map<string, R>>, env: string) =>
    [...perName.values()].flatMap((perEnv) => {
      const resource = perEnv.get(env);
      return resource ? [resource] : [];
    });
  const movableSecretsIn = (env: string) =>
    inEnvironment(secrets, env).filter((secret) => !secret.managedBy && !secret.honeyToken);

  const movedFolders: MovedFolder[] = isSingleEnvMode
    ? inEnvironment(folders, sourceEnv.value).map(({ name }) => ({
        name,
        sourceEnv: sourceEnv.value,
        destinationEnvironment: destinationEnv
      }))
    : [...folders.entries()].flatMap(([name, perEnv]) =>
        [...perEnv.keys()].map((env) => ({ name, sourceEnv: env, destinationEnvironment: env }))
      );
  const isCandidateBlocked = (candidate: string) =>
    movedFolders.some(
      ({ name, sourceEnv: env, destinationEnvironment }) =>
        env === destinationEnvironment && isPathInsideFolder(candidate, childPath(sourcePath, name))
    );

  const pathEnvironments = isSingleEnvMode
    ? environments.filter(({ value }) => value === destinationEnv)
    : environments;
  const creationEnvironments: EnvironmentOption[] = isSingleEnvMode
    ? pathEnvironments
    : environments.filter(
        ({ value }) =>
          inEnvironment(secrets, value).length > 0 ||
          inEnvironment(rotations, value).length > 0 ||
          inEnvironment(folders, value).length > 0
      );
  const pathSets = new Map(
    pathEnvironments.map(({ value }) => [
      value,
      new Set(
        resources
          .filter(
            (resource) =>
              resource.kind === "folder" &&
              resource.project === project &&
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
          project,
          environment: environment.value,
          path,
          name,
          description: "",
          id: `${project}:${environment.value}:${path}:folder:${name}`,
          createdAt: now,
          updatedAt: now
        };
      })
    );
    onApply((current) => [...current, ...created], {
      title: `Created ${candidatePath} in ${missing
        .map(({ environment }) => environment.label)
        .join(", ")}`
    });
    setCreateError(undefined);
    setSelectedPath(candidatePath);
  };

  const at = (resource: Resource, env: string, path: string) =>
    resource.project === project && resource.environment === env && resource.path === path;

  const moveSecretsStep =
    (env: string, destination: string, names: string[]): Step =>
    (current) =>
      planSecretMove(current, {
        project,
        sourceEnvironment: env,
        sourcePath,
        destinationEnvironment: destination,
        destinationPath: selectedPath,
        names,
        shouldOverwrite
      });

  const moveRotationStep =
    (rotation: Rotation, destination: string): Step =>
    (current) => {
      if (
        current.some(
          (resource) =>
            resource.kind === "rotation" &&
            at(resource, destination, selectedPath) &&
            resource.name === rotation.name
        )
      )
        return {
          error: `A Secret Rotation with the name "${rotation.name}" already exists at the secret path "${selectedPath}"`
        };
      const managed = current.filter(
        (resource): resource is Secret =>
          resource.kind === "secret" &&
          at(resource, rotation.environment, sourcePath) &&
          resource.managedBy === rotation.name
      );
      const managedNames = new Set(managed.map(({ name }) => name));
      const conflicts = current.filter(
        (resource) =>
          resource.kind === "secret" &&
          at(resource, destination, selectedPath) &&
          managedNames.has(resource.name)
      );
      if (conflicts.length && !shouldOverwrite)
        return {
          error: `The following secrets already exist at the destination path "${selectedPath}": ${conflicts.map(({ name }) => name).join(", ")}. Set "overwriteDestination" to true to replace them.`
        };
      const conflictIds = new Set(conflicts.map(({ id }) => id));
      const moving = new Set([rotation.id, ...managed.map(({ id }) => id)]);
      return {
        next: current
          .filter(({ id }) => !conflictIds.has(id))
          .map((resource) =>
            moving.has(resource.id) ? relocate(resource, destination, selectedPath) : resource
          )
      };
    };

  const moveFolderStep =
    (folder: Folder, destination: string): Step =>
    (current) => {
      if (
        current.some(
          (resource) =>
            resource.kind === "folder" &&
            at(resource, destination, selectedPath) &&
            resource.name === folder.name
        )
      )
        return {
          error: `A folder named '${folder.name}' already exists at path '${selectedPath}' in environment '${destination}'`
        };
      return {
        next: moveFolderResources(
          current,
          folder,
          [{ environment: folder.environment, destinationEnvironment: destination }],
          selectedPath
        )
      };
    };

  let working = [...resources];
  const run = (step: Step) => {
    const outcome = step(working);
    if ("next" in outcome) working = outcome.next;
    return outcome;
  };
  const apply = (steps: Step[], feedback: ApplyFeedback) =>
    onApply(
      (current) =>
        steps.reduce((state, step) => {
          const outcome = step(state);
          return "next" in outcome ? outcome.next : state;
        }, current),
      feedback,
      { shouldOverwrite }
    );
  const waitingForReview = (removed: string[]): FlowFeedback => ({
    tone: "neutral",
    title: "Move waiting for review",
    description: removed.length
      ? `Already removed from ${sourcePath} in ${new Intl.ListFormat("en").format(
          removed.map((env) => environments.find((entry) => entry.value === env)?.label ?? env)
        )}`
      : undefined
  });
  const folderMove = (folder: Folder, destination: string): FolderMove => ({
    environment: folder.environment,
    destinationEnvironment: destination,
    from: childPath(sourcePath, folder.name),
    to: childPath(selectedPath, folder.name)
  });

  const submitSingle = () => {
    const env = sourceEnv.value;
    const secretsToMove = movableSecretsIn(env);
    const rotationsToMove = inEnvironment(rotations, env);
    const foldersToMove = inEnvironment(folders, env);
    if (!secretsToMove.length && !rotationsToMove.length && !foldersToMove.length) {
      onToast("neutral", { title: "Nothing selected to move in this environment" });
      return;
    }
    if (secretsToMove.length) {
      const step = moveSecretsStep(
        env,
        destinationEnv,
        secretsToMove.map(({ name }) => name)
      );
      const outcome = run(step);
      if ("error" in outcome) {
        if (!foldersToMove.length && !rotationsToMove.length) {
          onToast("bad", { title: outcome.error });
          return;
        }
        onToast("bad", { title: `Failed to move selected secrets: ${outcome.error}` });
      } else {
        apply([step], (held) =>
          held(destinationEnv, selectedPath)
            ? waitingForReview(held(env, sourcePath) ? [] : [env])
            : { title: "Successfully moved selected secrets" }
        );
      }
    }
    const rotationSteps: Step[] = [];
    const rotationFailures: string[] = [];
    rotationsToMove.forEach((rotation) => {
      const step = moveRotationStep(rotation, destinationEnv);
      if ("error" in run(step)) rotationFailures.push(rotation.name);
      else rotationSteps.push(step);
    });
    if (rotationSteps.length)
      apply(rotationSteps, {
        title: `Successfully moved ${plural(rotationSteps.length, "secret rotation")}`
      });
    if (rotationFailures.length)
      onToast("bad", {
        title: `Failed to move ${plural(rotationFailures.length, "secret rotation")}: ${rotationFailures.join(", ")}`
      });
    const folderSteps: Step[] = [];
    const moved: FolderMove[] = [];
    const folderFailures: { name: string; message: string }[] = [];
    foldersToMove.forEach((folder) => {
      const step = moveFolderStep(folder, destinationEnv);
      const outcome = run(step);
      if ("error" in outcome) {
        folderFailures.push({ name: folder.name, message: outcome.error });
        return;
      }
      folderSteps.push(step);
      moved.push(folderMove(folder, destinationEnv));
    });
    if (folderSteps.length) {
      apply(folderSteps, {
        title: `Successfully moved ${plural(folderSteps.length, "folder")}`
      });
      onFoldersMoved?.(moved);
    }
    if (folderFailures.length)
      onToast("bad", {
        title: `Failed to move ${plural(folderFailures.length, "folder")}: ${folderFailures
          .map(({ name }) => name)
          .join(", ")}`,
        description: folderFailures.map(({ message }) => message).join(" ")
      });
    onClose();
    onCompleted?.();
  };

  const submitMulti = () => {
    const nextResults: MoveResult[] = [];
    const steps: Step[] = [];
    const moved: FolderMove[] = [];
    const changed = new Set<string>();
    const nonSecretMoves = new Set<string>();
    const selectedCount = secrets.size + rotations.size + folders.size;
    let selectedPluralNoun = noun;
    let selectedNoun = noun === "items" ? "item" : noun.slice(0, -1);
    if (rotations.size === selectedCount) {
      selectedNoun = "secret rotation";
      selectedPluralNoun = "secret rotations";
    }
    const record = (env: string, step: Step, id: string, name: string, success: string) => {
      const outcome = run(step);
      if ("error" in outcome) {
        nextResults.push({ id, name, status: "error", message: outcome.error });
        return false;
      }
      steps.push(step);
      changed.add(env);
      nextResults.push({ id, name, status: "success", message: success });
      return true;
    };
    environments.forEach((environment) => {
      const env = environment.value;
      const secretsToMove = movableSecretsIn(env);
      const rotationsToMove = inEnvironment(rotations, env);
      const foldersToMove = inEnvironment(folders, env);
      if (!secretsToMove.length && !rotationsToMove.length && !foldersToMove.length) {
        nextResults.push({
          id: env,
          name: environment.label,
          status: "info",
          message:
            selectedCount === 1
              ? `The selected ${selectedNoun} isn't in this environment.`
              : `None of the selected ${selectedPluralNoun} are in this environment.`
        });
        return;
      }
      if (secretsToMove.length) {
        const step = moveSecretsStep(
          env,
          env,
          secretsToMove.map(({ name }) => name)
        );
        record(
          env,
          step,
          env,
          environment.label,
          `${plural(secretsToMove.length, "secret")} moved.`
        );
      }
      rotationsToMove.forEach((rotation) => {
        const step = moveRotationStep(rotation, env);
        if (
          record(
            env,
            step,
            `${env}-${rotation.name}`,
            `${environment.label} / ${rotation.name}`,
            "Secret rotation moved."
          )
        )
          nonSecretMoves.add(env);
      });
      foldersToMove.forEach((folder) => {
        const step = moveFolderStep(folder, env);
        if (
          record(
            env,
            step,
            `${env}-folder-${folder.name}`,
            `${environment.label} / ${folder.name}`,
            "Folder moved."
          )
        ) {
          moved.push(folderMove(folder, env));
          nonSecretMoves.add(env);
        }
      });
    });
    if (steps.length) {
      apply(steps, (held) => {
        const written = [...changed].filter(
          (env) => nonSecretMoves.has(env) || !held(env, selectedPath)
        );
        if (!written.length)
          return waitingForReview([...changed].filter((env) => !held(env, sourcePath)));
        return { title: `Moved selected ${noun} in ${plural(written.length, "environment")}` };
      });
      if (moved.length) onFoldersMoved?.(moved);
    }
    setResults(nextResults);
  };

  const close = () => {
    onClose();
    if (results) onCompleted?.();
  };

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
    if (blockedFolders.length)
      return (
        <Alert tone="bad" title="This folder can't be moved">
          <ul className={styles.bullets}>
            {blockedFolders.map(({ name, message }) => (
              <li key={name}>{message}</li>
            ))}
          </ul>
        </Alert>
      );
    const isSingleRbacFolder = foldersWithRbacPolicies.length === 1;
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
              <div className={styles.stackTight}>
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
                <FieldError>{createError}</FieldError>
              </div>
            }
          />
          {!isSingleEnvMode && <SmallText muted>Creates one commit per environment.</SmallText>}
        </div>
        {isSelfMove && (
          <Alert tone="bad" title="This move is not allowed">
            You cannot move a folder into itself or one of its own subfolders.
          </Alert>
        )}
        {foldersWithRbacPolicies.length > 0 && (
          <Alert
            tone="warn"
            title={`Folder permissions will move with ${isSingleRbacFolder ? "this folder" : "these folders"}`}
          >
            {`Users and identities with access granted on ${foldersWithRbacPolicies
              .map((name) => `"${name}"`)
              .join(", ")} or ${
              isSingleRbacFolder ? "its subfolders" : "their subfolders"
            } keep it at the new location.`}
          </Alert>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        className={styles.moveDialog}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{results ? "Move summary" : title}</DialogTitle>
          {!isSingleEnvMode && !results && (
            <DialogDescription>Moves to the same folder in each environment.</DialogDescription>
          )}
        </DialogHeader>
        {renderBody()}
        <DialogFooter>
          {results || blockedFolders.length ? (
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          ) : (
            <>
              {hasSecretsOrRotations && (
                <span className={styles.overwrite}>
                  <Switch
                    checked={shouldOverwrite}
                    onCheckedChange={setShouldOverwrite}
                    label="Overwrite existing secrets"
                  />
                  <Tooltip content="Overwrite matching destination keys, including keys hidden by your access.">
                    <span className={styles.hint}>
                      <Icon name="info" size={14} label="About overwriting existing secrets" />
                    </span>
                  </Tooltip>
                </span>
              )}
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Gate reason={moveBlock}>
                <Button
                  disabled={!destinationSelected || isSelfMove || Boolean(moveBlock)}
                  onClick={isSingleEnvMode ? submitSingle : submitMulti}
                >
                  {title}
                </Button>
              </Gate>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MoveSecretsDialog(props: Props) {
  const { targets, open } = props;
  const [last, setLast] = useState(targets);
  const [session, setSession] = useState(0);
  if (targets && targets !== last) {
    setLast(targets);
    setSession(session + 1);
  }
  if (!last) return null;
  return (
    <MoveSecretsDialogContent
      key={session}
      {...props}
      targets={last}
      open={open ?? Boolean(targets)}
    />
  );
}
