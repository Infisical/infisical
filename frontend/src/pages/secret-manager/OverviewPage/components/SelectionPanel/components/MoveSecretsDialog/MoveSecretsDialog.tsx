import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CheckCircleIcon,
  CheckIcon,
  CircleAlertIcon,
  FolderIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Combobox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions
} from "@app/context/ProjectPermissionContext/types";
import { removeTrailingSlash } from "@app/helpers/string";
import { useMoveSecrets } from "@app/hooks/api";
import {
  dashboardKeys,
  FolderMoveBlockedDestination,
  useGetFoldersMoveDestinationEligibility,
  useGetFoldersMoveEligibility
} from "@app/hooks/api/dashboard/queries";
import {
  FolderMoveBlockingType,
  TFolderMoveDestinationCheck
} from "@app/hooks/api/dashboard/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import {
  folderQueryKeys,
  useGetOrCreateFolder,
  useListProjectEnvironmentsFolders,
  useMoveFolder
} from "@app/hooks/api/secretFolders/queries";
import { TSecretFolder } from "@app/hooks/api/secretFolders/types";
import { TSecretRotationV2, useMoveSecretRotation } from "@app/hooks/api/secretRotationsV2";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  environments: ProjectEnv[];
  visibleEnvs: ProjectEnv[];
  projectId: string;
  projectName: string;
  projectSlug: string;
  sourceSecretPath: string;
  secrets: Record<string, Record<string, SecretV3RawSanitized>>;
  rotations: Record<string, Record<string, TSecretRotationV2>>;
  folders: Record<string, Record<string, TSecretFolder>>;
  onComplete: () => void;
};

type ContentProps = Omit<Props, "isOpen" | "onOpenChange"> & {
  onClose: () => void;
  foldersWithRbacPolicies: string[];
};

type FolderOptionValue = {
  kind: "folder";
  secretPath: string;
};

type CreateOptionValue = {
  kind: "create";
  secretPath: string;
  createDisabledReason?: string;
};

type OptionValue = FolderOptionValue | CreateOptionValue;

const joinSecretPath = (basePath: string, name: string) =>
  basePath === "/" ? `/${name}` : `${basePath}/${name}`;

const folderNameRegex = /^[a-zA-Z0-9-_]+$/;

const stripLeadingSlashes = (path: string) => path.replace(/^\/+/, "");

const normalizeFolderPathInput = (path: string) => stripLeadingSlashes(path).replace(/\s+/g, "-");

const getPathSegments = (path: string) => stripLeadingSlashes(path.trim()).split("/");

const getAbsolutePath = (path: string) => {
  const pathWithoutRoot = stripLeadingSlashes(path.trim());
  return pathWithoutRoot ? `/${pathWithoutRoot}` : "/";
};

const isValidFolderPath = (path: string) => {
  const segments = getPathSegments(path);
  return (
    segments.length > 0 &&
    segments.every(
      (segment) => segment.length > 0 && segment.length <= 255 && folderNameRegex.test(segment)
    )
  );
};

const PathValue = ({ secretPath }: { secretPath: string }) => {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <FolderIcon className="size-4 shrink-0 text-folder" aria-hidden="true" />
      <span className="truncate font-mono text-xs">{secretPath}</span>
    </span>
  );
};

const StaticLocationValue = ({
  accessibleLabel,
  children
}: {
  accessibleLabel: string;
  children: ReactNode;
}) => {
  return (
    <div className="flex h-9 min-w-0 items-center rounded-md border border-border bg-container px-3 text-sm text-foreground">
      <span className="sr-only">{accessibleLabel}: </span>
      {children}
    </div>
  );
};

const MoveLocationLayout = ({
  sourceEnvironment,
  sourceSecretPath,
  destinationEnvironment,
  destinationPath
}: {
  sourceEnvironment: ReactNode;
  sourceSecretPath: string;
  destinationEnvironment: ReactNode;
  destinationPath: ReactNode;
}) => (
  <div className="flex min-w-0 flex-col gap-3">
    <div
      className="grid min-w-0 grid-cols-[minmax(7.5rem,0.8fr)_minmax(0,1.2fr)] gap-2"
      role="group"
      aria-label="Source location"
    >
      {sourceEnvironment}
      <StaticLocationValue accessibleLabel="Source folder">
        <PathValue secretPath={sourceSecretPath} />
      </StaticLocationValue>
    </div>
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,4fr)] items-center gap-3"
      aria-hidden="true"
    >
      <span className="h-px bg-border" />
      <span className="text-xs font-medium text-muted">Move to</span>
      <span className="h-px bg-border" />
    </div>
    <div
      className="grid min-w-0 grid-cols-[minmax(7.5rem,0.8fr)_minmax(0,1.2fr)] gap-2"
      role="group"
      aria-label="Destination location"
    >
      {destinationEnvironment}
      {destinationPath}
    </div>
  </div>
);

// mirrors the backend cyclic-move rule: a folder cannot be moved into itself or one of its own subfolders.
const isPathInsideFolder = (destinationPath: string, folderPath: string) =>
  destinationPath === folderPath || destinationPath.startsWith(`${folderPath}/`);

const DestinationPathField = ({
  pathEnvironments,
  creationEnvironments,
  projectId,
  inputId,
  value,
  onChange,
  isCreating,
  onCreatingChange,
  isCandidateBlocked,
  hideLabel = false
}: {
  pathEnvironments: ProjectEnv[];
  creationEnvironments: ProjectEnv[];
  projectId: string;
  inputId: string;
  value: OptionValue | null;
  onChange: (newValue: OptionValue | null) => void;
  isCreating: boolean;
  onCreatingChange: (isCreating: boolean) => void;
  isCandidateBlocked: (destinationPath: string) => boolean;
  hideLabel?: boolean;
}) => {
  const { permission } = useProjectPermission();
  const getOrCreateFolder = useGetOrCreateFolder();
  const queryClient = useQueryClient();
  const createRequestRef = useRef(false);
  const [inputPath, setInputPath] = useState("");
  const candidatePath = getAbsolutePath(inputPath);
  const candidateSegments = getPathSegments(inputPath);
  const candidateParentPaths = candidateSegments.map((_, index) =>
    index === 0 ? "/" : `/${candidateSegments.slice(0, index).join("/")}`
  );
  const isCandidateValid = isValidFolderPath(inputPath);
  const isRootPath = inputPath.trim() === "";
  const {
    data: environmentFolders,
    isPending: isFolderTreePending,
    isFetching: isFolderTreeFetching,
    isError: isFolderTreeError
  } = useListProjectEnvironmentsFolders(projectId, { staleTime: 0 });

  const isCheckingFolderTree = isFolderTreePending || isFolderTreeFetching;
  const folderPathsByEnvironment = useMemo(
    () =>
      new Map(
        pathEnvironments.map((environment) => [
          environment.slug,
          new Set(
            (environmentFolders?.[environment.slug]?.folders ?? []).map(({ path }) =>
              removeTrailingSlash(path)
            )
          )
        ])
      ),
    [environmentFolders, pathEnvironments]
  );
  const allFolderPaths = useMemo(() => {
    const folderPaths = new Set<string>();
    folderPathsByEnvironment.forEach((environmentPaths) => {
      environmentPaths.forEach((folderPath) => folderPaths.add(folderPath));
    });
    return Array.from(folderPaths);
  }, [folderPathsByEnvironment]);
  const normalizedInputPath = inputPath.toLocaleLowerCase();
  const folderOptions = useMemo<FolderOptionValue[]>(
    () =>
      allFolderPaths
        .filter(
          (secretPath) =>
            secretPath !== "/" &&
            (!normalizedInputPath ||
              secretPath.toLocaleLowerCase().includes(normalizedInputPath)) &&
            (creationEnvironments.length === 0 ||
              creationEnvironments.every((environment) =>
                folderPathsByEnvironment.get(environment.slug)?.has(secretPath)
              ))
        )
        .sort((left, right) => left.localeCompare(right))
        .map((secretPath) => ({ kind: "folder", secretPath })),
    [allFolderPaths, creationEnvironments, folderPathsByEnvironment, normalizedInputPath]
  );
  const missingCreationTargets = isRootPath
    ? []
    : creationEnvironments
        .map((environment) => ({
          environment,
          missingParentPaths: candidateParentPaths.filter((_, index) => {
            const folderPath = `/${candidateSegments.slice(0, index + 1).join("/")}`;
            return !folderPathsByEnvironment.get(environment.slug)?.has(folderPath);
          })
        }))
        .filter(({ missingParentPaths }) => missingParentPaths.length > 0);
  const matchesExistingFolder =
    !isRootPath && creationEnvironments.length > 0 && missingCreationTargets.length === 0;
  const isCandidateMoveBlocked = isCandidateBlocked(candidatePath);

  const restrictedEnvironments = isCandidateValid
    ? missingCreationTargets.filter(({ environment, missingParentPaths }) =>
        missingParentPaths.some((parentPath) =>
          permission.cannot(
            ProjectPermissionActions.Create,
            subject(ProjectPermissionSub.SecretFolders, {
              environment: environment.slug,
              secretPath: parentPath
            })
          )
        )
      )
    : [];

  const canCreate =
    isCandidateValid &&
    !matchesExistingFolder &&
    !isCandidateMoveBlocked &&
    !isCheckingFolderTree &&
    !isFolderTreeError &&
    !isCreating &&
    missingCreationTargets.length > 0 &&
    restrictedEnvironments.length === 0;

  let disabledReason = "Type a new folder name";
  if (creationEnvironments.length === 0) {
    disabledReason = "No selected environments can create this folder";
  } else if (inputPath && !isCandidateValid) {
    disabledReason = "Folder names can only contain letters, numbers, dashes, and underscores";
  } else if (isRootPath) {
    disabledReason = "Type a new folder name";
  } else if (isFolderTreeError) {
    disabledReason = "Could not check existing folders";
  } else if (isCheckingFolderTree) {
    disabledReason = "Checking whether this folder already exists";
  } else if (isCandidateMoveBlocked) {
    disabledReason = "Folders can't be moved into themselves or their subfolders";
  } else if (restrictedEnvironments.length > 0) {
    disabledReason = `You don't have permission to create folders in ${restrictedEnvironments
      .map(({ environment }) => environment.name)
      .join(", ")}`;
  } else if (matchesExistingFolder) {
    disabledReason = "This folder already exists";
  } else if (isCreating) {
    disabledReason = "Creating folder";
  }

  const rootOption: FolderOptionValue = {
    kind: "folder",
    secretPath: "/"
  };
  const createOption: CreateOptionValue | null =
    !isRootPath && !matchesExistingFolder
      ? {
          kind: "create",
          secretPath: candidatePath,
          createDisabledReason: canCreate ? undefined : disabledReason
        }
      : null;
  const options: OptionValue[] = [
    rootOption,
    ...folderOptions,
    ...(createOption ? [createOption] : [])
  ];

  const handleCreatePath = async (path: string) => {
    const absolutePath = getAbsolutePath(path);
    if (!canCreate || absolutePath !== candidatePath || createRequestRef.current) return;

    createRequestRef.current = true;
    onCreatingChange(true);

    try {
      let parentPath = "/";
      let didCreateAllFolders = true;

      // Create each segment in order so a typed path such as /apps/api creates both levels.
      // The get-or-create mutation keeps retries idempotent after a partial failure.
      // eslint-disable-next-line no-restricted-syntax
      for await (const segment of getPathSegments(path)) {
        const currentParentPath = parentPath;
        const environmentsMissingSegment = missingCreationTargets
          .filter(({ missingParentPaths }) => missingParentPaths.includes(currentParentPath))
          .map(({ environment }) => environment);
        const results = await Promise.allSettled(
          environmentsMissingSegment.map((environment) =>
            getOrCreateFolder.mutateAsync({
              name: segment,
              description: null,
              environment: environment.slug,
              path: currentParentPath,
              projectId
            })
          )
        );

        if (results.some((result) => result.status === "rejected")) {
          didCreateAllFolders = false;
          break;
        }

        parentPath = joinSecretPath(parentPath, segment);
      }

      if (!didCreateAllFolders) {
        await queryClient.invalidateQueries({
          queryKey: folderQueryKeys.getProjectEnvironmentsFolders(projectId)
        });
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath: "/" })
        }),
        queryClient.invalidateQueries({
          queryKey: folderQueryKeys.getProjectEnvironmentsFolders(projectId)
        })
      ]);
      setInputPath("");
      onChange({
        kind: "folder",
        secretPath: absolutePath
      });
    } finally {
      createRequestRef.current = false;
      onCreatingChange(false);
    }
  };

  return (
    <Field>
      <FieldLabel htmlFor={inputId} className={hideLabel ? "sr-only" : undefined}>
        Destination folder
      </FieldLabel>
      <FieldContent>
        <InputGroup data-disabled={isCreating || undefined}>
          <InputGroupAddon align="inline-start" className="pr-0 [&>svg]:text-folder">
            <FolderIcon aria-hidden="true" />
          </InputGroupAddon>
          <Combobox
            id={inputId}
            variant="input-group"
            modal
            options={options}
            value={value}
            isDisabled={isCreating}
            isLoading={isCreating || isFolderTreePending}
            shouldFilter={false}
            includeMissingSelectedOptions={!inputPath}
            placeholder="Select a destination folder..."
            searchPlaceholder="Search or create a folder..."
            searchAriaLabel="Search destination folders"
            emptyMessage="No folders found. Type a path to create one."
            loadingMessage={isCreating ? "Creating folder..." : "Loading folders..."}
            getOptionValue={(option) =>
              option.kind === "create" ? `create:${option.secretPath}` : option.secretPath
            }
            getOptionLabel={(option) => option.secretPath}
            isOptionDisabled={(option) =>
              option.kind === "create" ? !canCreate : isCandidateBlocked(option.secretPath)
            }
            renderOption={(option) => (
              <span className="min-w-0 truncate font-mono text-xs">{option.secretPath}</span>
            )}
            renderOptionIndicator={(option, { isSelected }) => {
              if (option.kind === "folder") {
                return isSelected ? <CheckIcon className="size-4" /> : null;
              }

              return (
                <span
                  className="max-w-56 truncate text-xs text-muted"
                  title={option.createDisabledReason}
                >
                  {option.createDisabledReason ?? "New Folder"}
                </span>
              );
            }}
            onInputValueChange={(nextValue) => {
              const normalizedPath = normalizeFolderPathInput(nextValue);
              setInputPath(normalizedPath);
              if (normalizedPath && value && getAbsolutePath(normalizedPath) !== value.secretPath) {
                onChange(null);
              }
            }}
            onClear={() => onChange(null)}
            onValueChange={async (option) => {
              if (option.kind === "create") {
                await handleCreatePath(option.secretPath);
                return;
              }
              onChange(option);
            }}
          />
        </InputGroup>
      </FieldContent>
    </Field>
  );
};

type MovedFolder = {
  folderId: string;
  folderName: string;
  sourceEnv: string;
  destinationEnvironment: string;
};

// builds the per-folder destination checks and flags a self/cyclic move. a self-move is only possible within the
// same environment, and is detected purely client-side; when detected we drop the checks so no server call fires
// (the backend would reject the move outright).
const buildDestinationTargets = ({
  movedFolders,
  sourceSecretPath,
  destinationPath
}: {
  movedFolders: MovedFolder[];
  sourceSecretPath: string;
  destinationPath?: string;
}): { checks: TFolderMoveDestinationCheck[]; isSelfMove: boolean } => {
  if (!destinationPath) return { checks: [], isSelfMove: false };

  const destination = removeTrailingSlash(destinationPath);
  const base = removeTrailingSlash(sourceSecretPath);
  let isSelfMove = false;
  const checks: TFolderMoveDestinationCheck[] = [];

  movedFolders.forEach(({ folderId, folderName, sourceEnv, destinationEnvironment }) => {
    if (
      destinationEnvironment === sourceEnv &&
      isPathInsideFolder(destination, joinSecretPath(base, folderName))
    ) {
      isSelfMove = true;
    }
    checks.push({ folderId, folderName, destinationEnvironment, destinationPath: destination });
  });

  return { checks: isSelfMove ? [] : checks, isSelfMove };
};

// memoizes the destination checks for the moved folders and runs the destination approval-policy eligibility
// query, returning what the move form needs to gate submit. shared by the single- and multi-environment content
// so the wiring lives in one place.
const useDestinationMoveGuard = ({
  movedFolders,
  sourceSecretPath,
  destinationPath
}: {
  movedFolders: MovedFolder[];
  sourceSecretPath: string;
  destinationPath?: string;
}) => {
  const { checks, isSelfMove } = useMemo(
    () => buildDestinationTargets({ movedFolders, sourceSecretPath, destinationPath }),
    [movedFolders, sourceSecretPath, destinationPath]
  );

  const { isChecking, isDestinationBlocked, blockedDestinations } =
    useGetFoldersMoveDestinationEligibility(checks);

  return {
    isSelfMove,
    isCheckingDestination: isChecking,
    isDestinationBlocked,
    blockedDestinations
  };
};

enum MoveResult {
  Success = "success",
  Info = "info",
  Error = "error"
}

type MoveResults = {
  status: MoveResult;
  name: string;
  id: string;
  message: string;
}[];

// the modal moves secrets, rotations and folders together, so the copy reflects what is actually selected
const getMoveSelectionCopy = ({
  secrets,
  rotations,
  folders
}: {
  secrets: Record<string, unknown>;
  rotations: Record<string, unknown>;
  folders: Record<string, unknown>;
}) => {
  const hasFolders = Object.keys(folders).length > 0;
  const hasSecretsOrRotations =
    Object.keys(secrets).length > 0 || Object.keys(rotations).length > 0;

  if (hasFolders && !hasSecretsOrRotations) {
    return { title: "Move Folders", action: "Move Folders", noun: "folders" };
  }
  if (hasFolders && hasSecretsOrRotations) {
    return { title: "Move Items", action: "Move Items", noun: "items" };
  }
  return { title: "Move Secrets", action: "Move Secrets", noun: "secrets" };
};

const singleEnvFormSchema = z.object({
  environment: z.string().trim(),
  shouldOverwrite: z.boolean().default(false)
});

type TSingleEnvFormSchema = z.infer<typeof singleEnvFormSchema>;

const MoveResultsView = ({
  moveResults,
  onComplete
}: {
  moveResults: MoveResults;
  onComplete: () => void;
}) => {
  return (
    <div className="w-full">
      <div className="mb-4 divide-y divide-border">
        {moveResults.map(({ id, name, status, message }) => {
          let resultClassName: string;
          let Icon: typeof CheckCircleIcon;

          switch (status) {
            case MoveResult.Success:
              Icon = CheckCircleIcon;
              resultClassName = "text-success";
              break;
            case MoveResult.Info:
              Icon = InfoIcon;
              resultClassName = "text-info";
              break;
            case MoveResult.Error:
            default:
              Icon = CircleAlertIcon;
              resultClassName = "text-danger";
          }

          return (
            <div key={id} className="flex items-start gap-3 py-3">
              <Icon className={twMerge(resultClassName, "mt-0.5 size-4 shrink-0")} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{name}</p>
                <p className="text-sm text-accent">{message}</p>
              </div>
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" onClick={() => onComplete()}>
            Close
          </Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
};

const formatBlockedDestination = (
  blocked: FolderMoveBlockedDestination,
  envNameBySlug: Map<string, string>
) => {
  const envName =
    envNameBySlug.get(blocked.destinationEnvironment) ?? blocked.destinationEnvironment;
  // a policy name is only present when the destination is actually governed by a secret approval policy.
  // when it is absent the destination is blocked because the actor lacks permission to create folders there.
  if (blocked.policyName && blocked.blockingPath) {
    return `At environment ${envName} the path "${blocked.blockingPath}" is governed by the secret approval policy "${blocked.policyName}", so "${blocked.folderName}" cannot be moved there.`;
  }
  return `At the destination environment "${envName}" you don't have permission to create folders, so "${blocked.folderName}" cannot be moved there.`;
};

// surfaces the two destination-side reasons a move is blocked: a cyclic/self move (client-side) and a destination
// governed by a secret approval policy (server-side, with a fail-closed "could not verify" fallback).
const MoveBlockAlerts = ({
  isSelfMove,
  isDestinationBlocked,
  blockedDestinations,
  environments
}: {
  isSelfMove: boolean;
  isDestinationBlocked: boolean;
  blockedDestinations: FolderMoveBlockedDestination[];
  environments: ProjectEnv[];
}) => {
  if (!isSelfMove && !isDestinationBlocked) return null;

  const envNameBySlug = new Map(environments.map((env) => [env.slug, env.name]));

  if (isSelfMove) {
    return (
      <Alert variant="danger">
        <CircleAlertIcon />
        <AlertTitle>This move is not allowed</AlertTitle>
        <AlertDescription>
          You cannot move a folder into itself or one of its own subfolders.
        </AlertDescription>
      </Alert>
    );
  }

  if (blockedDestinations.length === 0) {
    return (
      <Alert variant="danger">
        <CircleAlertIcon />
        <AlertTitle>Could not verify the destination</AlertTitle>
        <AlertDescription>
          We could not verify whether the destination allows this move. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  // a blocked destination carries a policy name only when it is genuinely governed by a secret approval
  // policy; otherwise the block is a permission issue (the actor cannot create folders at the destination).
  // title the alert by what actually blocks the set so a permission block is not mislabeled as a policy.
  const hasPolicyBlock = blockedDestinations.some((blocked) => Boolean(blocked.policyName));
  const hasPermissionBlock = blockedDestinations.some((blocked) => !blocked.policyName);
  let title = "This move is blocked";
  if (hasPolicyBlock && !hasPermissionBlock) {
    title = "The destination is protected by a secret approval policy";
  } else if (hasPermissionBlock && !hasPolicyBlock) {
    title = "You don't have permission to move to the destination";
  }

  return (
    <Alert variant="danger">
      <CircleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {blockedDestinations.map((blocked) => (
            <li key={`${blocked.folderName}:${blocked.destinationEnvironment}`}>
              {formatBlockedDestination(blocked, envNameBySlug)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

const FolderRbacPoliciesWarning = ({ folderNames }: { folderNames: string[] }) => {
  if (!folderNames.length) return null;

  const isSingle = folderNames.length === 1;

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>
        Folder permissions will move with {isSingle ? "this folder" : "these folders"}
      </AlertTitle>
      <AlertDescription>
        Folder-specific permissions are granted on{" "}
        {folderNames.map((name) => `"${name}"`).join(", ")} or{" "}
        {isSingle ? "one of its subfolders" : "their subfolders"}. Users and identities with this
        access will keep it at the new location.
      </AlertDescription>
    </Alert>
  );
};

const OverwriteControl = ({
  id,
  isChecked,
  isDisabled,
  onCheckedChange
}: {
  id: string;
  isChecked: boolean;
  isDisabled: boolean;
  onCheckedChange: (isChecked: boolean) => void;
}) => (
  <div className="mr-auto flex min-w-0 items-center gap-2">
    <Toggle
      id={id}
      variant="danger"
      checked={isChecked}
      disabled={isDisabled}
      onCheckedChange={onCheckedChange}
    />
    <Label htmlFor={id}>Overwrite existing secrets</Label>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-sm text-muted focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="About overwriting existing secrets"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        Overwrite matching destination keys, including keys hidden by your access.
      </TooltipContent>
    </Tooltip>
  </div>
);

const SingleEnvContent = ({
  onComplete,
  onClose,
  secrets,
  rotations,
  folders,
  environments,
  visibleEnvs,
  projectId,
  projectSlug,
  sourceSecretPath,
  foldersWithRbacPolicies
}: ContentProps) => {
  const sourceEnv = visibleEnvs[0];
  const moveCopy = getMoveSelectionCopy({ secrets, rotations, folders });
  const showOverwriteOption = Object.keys(secrets).length > 0 || Object.keys(rotations).length > 0;
  const moveSecrets = useMoveSecrets();
  const moveSecretRotation = useMoveSecretRotation();
  const moveFolder = useMoveFolder();
  const [selectedPath, setSelectedPath] = useState<OptionValue | null>({
    kind: "folder",
    secretPath: "/"
  });
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting }
  } = useForm<TSingleEnvFormSchema>({
    resolver: zodResolver(singleEnvFormSchema),
    defaultValues: {
      environment: sourceEnv.slug,
      shouldOverwrite: false
    }
  });

  const selectedEnvironment = watch("environment");

  useEffect(() => {
    setSelectedPath({
      kind: "folder",
      secretPath: "/"
    });
  }, [selectedEnvironment]);

  const destinationSelected =
    Boolean(selectedPath?.secretPath) &&
    (sourceSecretPath !== selectedPath?.secretPath || selectedEnvironment !== sourceEnv.slug);

  // a single-env move relocates every selected folder (taken from the source environment) to the chosen
  // destination environment.
  const movedFolders = useMemo<MovedFolder[]>(
    () =>
      Object.values(folders)
        .map((folderRecord) => folderRecord[sourceEnv.slug])
        .filter((folder): folder is TSecretFolder => Boolean(folder))
        .map((folder) => ({
          folderId: folder.id,
          folderName: folder.name,
          sourceEnv: sourceEnv.slug,
          destinationEnvironment: selectedEnvironment
        })),
    [folders, sourceEnv.slug, selectedEnvironment]
  );

  const { isSelfMove, isCheckingDestination, isDestinationBlocked, blockedDestinations } =
    useDestinationMoveGuard({
      movedFolders,
      sourceSecretPath,
      destinationPath: destinationSelected ? selectedPath?.secretPath : undefined
    });

  const handleFormSubmit = async (data: TSingleEnvFormSchema) => {
    if (!selectedPath) {
      createNotification({
        type: "error",
        text: "You must specify a secret path to move the selected secrets to"
      });
      return;
    }

    const secretsToMove = Object.values(secrets)
      .map((secretRecord) => secretRecord[sourceEnv.slug])
      .filter(
        (secret): secret is SecretV3RawSanitized =>
          Boolean(secret) && !secret.isRotatedSecret && !secret.isHoneyTokenSecret
      );

    const rotationsToMove = Object.values(rotations)
      .map((rotationRecord) => rotationRecord[sourceEnv.slug])
      .filter((rotation): rotation is TSecretRotationV2 => Boolean(rotation));

    const foldersToMove = Object.values(folders)
      .map((folderRecord) => folderRecord[sourceEnv.slug])
      .filter((folder): folder is TSecretFolder => Boolean(folder));

    if (!secretsToMove.length && !rotationsToMove.length && !foldersToMove.length) {
      createNotification({
        type: "info",
        text: "Nothing selected to move in this environment"
      });
      return;
    }

    let isDestinationUpdated = true;
    let isSourceUpdated = true;

    if (secretsToMove.length) {
      const result = await moveSecrets.mutateAsync({
        shouldOverwrite: data.shouldOverwrite,
        sourceEnvironment: sourceEnv.slug,
        sourceSecretPath,
        destinationEnvironment: data.environment,
        destinationSecretPath: selectedPath.secretPath,
        projectId,
        projectSlug,
        secretIds: secretsToMove.map((sec) => sec.id)
      });
      isDestinationUpdated = result.isDestinationUpdated;
      isSourceUpdated = result.isSourceUpdated;
    }

    const rotationFailures: { name: string; message: string }[] = [];
    let rotationSuccessCount = 0;

    // eslint-disable-next-line no-restricted-syntax
    for await (const rotation of rotationsToMove) {
      try {
        await moveSecretRotation.mutateAsync({
          type: rotation.type,
          rotationId: rotation.id,
          destinationEnvironment: data.environment,
          destinationSecretPath: selectedPath.secretPath,
          overwriteDestination: data.shouldOverwrite,
          projectId,
          secretPath: sourceSecretPath
        });
        rotationSuccessCount += 1;
      } catch (error) {
        let message = (error as Error)?.message ?? "Failed to move rotation";
        if (axios.isAxiosError(error)) {
          const responseMessage = (error?.response?.data as { message?: string })?.message;
          if (responseMessage) message = responseMessage;
        }
        rotationFailures.push({ name: rotation.name, message });
      }
    }

    const folderFailures: { name: string; message: string }[] = [];
    let folderSuccessCount = 0;
    let folderApprovalCount = 0;

    // eslint-disable-next-line no-restricted-syntax
    for await (const folder of foldersToMove) {
      try {
        const result = await moveFolder.mutateAsync({
          projectId,
          folderId: folder.id,
          sourceEnvironment: sourceEnv.slug,
          sourcePath: sourceSecretPath,
          destinationEnvironment: data.environment,
          destinationPath: selectedPath.secretPath,
          shouldOverwrite: data.shouldOverwrite
        });
        folderSuccessCount += 1;
        if (result.hasApprovalRequests) folderApprovalCount += 1;
      } catch (error) {
        let message = (error as Error)?.message ?? "Failed to move folder";
        if (axios.isAxiosError(error)) {
          const responseMessage = (error?.response?.data as { message?: string })?.message;
          if (responseMessage) message = responseMessage;
        }
        folderFailures.push({ name: folder.name, message });
      }
    }

    if (secretsToMove.length) {
      if (isDestinationUpdated && isSourceUpdated) {
        createNotification({
          type: "success",
          text: "Successfully moved selected secrets"
        });
      } else if (isDestinationUpdated) {
        createNotification({
          type: "info",
          text: "Successfully created secrets in destination. A secret approval request has been generated for the source."
        });
      } else if (isSourceUpdated) {
        createNotification({
          type: "info",
          text: "A secret approval request has been generated in the destination"
        });
      } else {
        createNotification({
          type: "info",
          text: "A secret approval request has been generated in both the source and the destination."
        });
      }
    }

    if (rotationSuccessCount > 0) {
      createNotification({
        type: "success",
        text: `Successfully moved ${rotationSuccessCount} secret rotation${
          rotationSuccessCount === 1 ? "" : "s"
        }`
      });
    }

    if (folderSuccessCount > 0) {
      createNotification({
        type: folderApprovalCount > 0 ? "info" : "success",
        text:
          folderApprovalCount > 0
            ? `Moved ${folderSuccessCount} folder${
                folderSuccessCount === 1 ? "" : "s"
              }. Approval requests were generated for change-policy protected paths.`
            : `Successfully moved ${folderSuccessCount} folder${folderSuccessCount === 1 ? "" : "s"}`
      });
    }

    if (folderFailures.length > 0) {
      createNotification({
        type: "error",
        text: `Failed to move ${folderFailures.length} folder${
          folderFailures.length === 1 ? "" : "s"
        }: ${folderFailures.map((f) => f.name).join(", ")}`
      });
    }

    onClose();
    onComplete();
  };

  return (
    <div className="flex flex-col gap-4">
      <MoveLocationLayout
        sourceEnvironment={
          <StaticLocationValue accessibleLabel="Source environment">
            <span className="truncate">{sourceEnv.name}</span>
          </StaticLocationValue>
        }
        sourceSecretPath={sourceSecretPath}
        destinationEnvironment={
          <Controller
            control={control}
            name="environment"
            render={({ field: { onChange, value } }) => (
              <Field>
                <FieldLabel htmlFor="move-destination-environment" className="sr-only">
                  Destination environment
                </FieldLabel>
                <FieldContent>
                  <Select value={value} onValueChange={onChange} disabled={isCreatingFolder}>
                    <SelectTrigger id="move-destination-environment" className="w-full">
                      <SelectValue placeholder="Environment..." />
                    </SelectTrigger>
                    <SelectContent position="popper" className="w-full">
                      {environments.map(({ name, slug }) => (
                        <SelectItem value={slug} key={slug}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          />
        }
        destinationPath={
          <DestinationPathField
            key={selectedEnvironment}
            hideLabel
            inputId="move-secret-path-single"
            pathEnvironments={
              selectedEnvironment
                ? environments.filter((environment) => environment.slug === selectedEnvironment)
                : environments
            }
            creationEnvironments={environments.filter(({ slug }) => slug === selectedEnvironment)}
            projectId={projectId}
            value={selectedPath}
            onChange={setSelectedPath}
            isCreating={isCreatingFolder}
            onCreatingChange={setIsCreatingFolder}
            isCandidateBlocked={(destinationPath) =>
              buildDestinationTargets({ movedFolders, sourceSecretPath, destinationPath })
                .isSelfMove
            }
          />
        }
      />
      <MoveBlockAlerts
        isSelfMove={isSelfMove}
        isDestinationBlocked={isDestinationBlocked}
        blockedDestinations={blockedDestinations}
        environments={environments}
      />
      <FolderRbacPoliciesWarning folderNames={foldersWithRbacPolicies} />
      <DialogFooter className="items-center">
        {showOverwriteOption && (
          <Controller
            control={control}
            name="shouldOverwrite"
            render={({ field: { value, onChange } }) => (
              <OverwriteControl
                id="overwrite-checkbox"
                isChecked={value}
                isDisabled={isSubmitting || isCreatingFolder}
                onCheckedChange={onChange}
              />
            )}
          />
        )}
        <DialogClose asChild>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogClose>
        <Button
          variant="project"
          onClick={handleSubmit(handleFormSubmit)}
          isDisabled={
            !destinationSelected ||
            isSubmitting ||
            isCreatingFolder ||
            isSelfMove ||
            isCheckingDestination ||
            isDestinationBlocked
          }
          isPending={isSubmitting}
        >
          {moveCopy.action}
        </Button>
      </DialogFooter>
    </div>
  );
};

const multiEnvFormSchema = z.object({
  shouldOverwrite: z.boolean().default(false)
});

type TMultiEnvFormSchema = z.infer<typeof multiEnvFormSchema>;

const MultiEnvContent = ({
  onComplete,
  onClose,
  onResults,
  secrets,
  rotations,
  folders,
  environments,
  projectId,
  projectSlug,
  sourceSecretPath,
  foldersWithRbacPolicies
}: ContentProps & { onResults: () => void }) => {
  const moveSecrets = useMoveSecrets();
  const moveSecretRotation = useMoveSecretRotation();
  const moveFolder = useMoveFolder();
  const moveCopy = getMoveSelectionCopy({ secrets, rotations, folders });
  const showOverwriteOption = Object.keys(secrets).length > 0 || Object.keys(rotations).length > 0;
  const { permission } = useProjectPermission();
  const [moveResults, setMoveResults] = useState<MoveResults | null>(null);
  const [selectedPath, setSelectedPath] = useState<OptionValue | null>({
    kind: "folder",
    secretPath: "/"
  });
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm<TMultiEnvFormSchema>({
    resolver: zodResolver(multiEnvFormSchema),
    defaultValues: {
      shouldOverwrite: false
    }
  });

  const moveEligibility = useMemo(() => {
    return Object.fromEntries(
      environments.map((env) => [
        env.slug,
        {
          cannotMoveSecrets: permission.cannot(
            ProjectPermissionSecretActions.Delete,
            subject(ProjectPermissionSub.Secrets, {
              environment: env.slug,
              secretPath: sourceSecretPath,
              secretName: "*",
              secretTags: ["*"]
            })
          ),
          cannotMoveRotations: permission.cannot(
            ProjectPermissionSecretRotationActions.Delete,
            subject(ProjectPermissionSub.SecretRotation, {
              environment: env.slug,
              secretPath: sourceSecretPath
            })
          )
        }
      ])
    );
  }, [permission, environments, sourceSecretPath]);

  const folderCreationEnvironments = useMemo(
    () =>
      environments.filter((environment) => {
        const envSlug = environment.slug;
        const hasMovableSecrets =
          Object.values(secrets).some((secretRecord) => Boolean(secretRecord[envSlug])) &&
          !moveEligibility[envSlug].cannotMoveSecrets;
        const hasMovableRotations =
          Object.values(rotations).some((rotationRecord) => Boolean(rotationRecord[envSlug])) &&
          !moveEligibility[envSlug].cannotMoveRotations;
        const hasFolders = Object.values(folders).some((folderRecord) =>
          Boolean(folderRecord[envSlug])
        );

        return hasMovableSecrets || hasMovableRotations || hasFolders;
      }),
    [environments, folders, moveEligibility, rotations, secrets]
  );

  const destinationSelected =
    Boolean(selectedPath?.secretPath) && sourceSecretPath !== selectedPath?.secretPath;

  // a multi-env move relocates each folder within its own environment, so the destination environment of
  // every check is that folder's source environment.
  const movedFolders = useMemo<MovedFolder[]>(() => {
    const result: MovedFolder[] = [];
    Object.values(folders).forEach((folderRecord) =>
      Object.entries(folderRecord).forEach(([envSlug, folder]) => {
        result.push({
          folderId: folder.id,
          folderName: folder.name,
          sourceEnv: envSlug,
          destinationEnvironment: envSlug
        });
      })
    );
    return result;
  }, [folders]);

  const { isSelfMove, isCheckingDestination, isDestinationBlocked, blockedDestinations } =
    useDestinationMoveGuard({
      movedFolders,
      sourceSecretPath,
      destinationPath: destinationSelected ? selectedPath?.secretPath : undefined
    });

  const environmentsToBeSkipped = useMemo(() => {
    if (!destinationSelected) return [];

    const environmentWarnings: { type: "permission" | "missing"; message: string; id: string }[] =
      [];

    environments.forEach((env) => {
      const { cannotMoveSecrets, cannotMoveRotations } = moveEligibility[env.slug];

      if (cannotMoveSecrets) {
        environmentWarnings.push({
          id: `${env.id}-secrets`,
          type: "permission",
          message: `${env.name}: You do not have permission to move secrets from this environment`
        });
      }

      if (cannotMoveRotations) {
        environmentWarnings.push({
          id: `${env.id}-rotations`,
          type: "permission",
          message: `${env.name}: You do not have permission to move secret rotations from this environment`
        });
      }
    });

    return environmentWarnings;
  }, [moveEligibility, destinationSelected, environments]);

  const handleFormSubmit = async (data: TMultiEnvFormSchema) => {
    if (!selectedPath) {
      createNotification({
        type: "error",
        text: "You must specify a secret path to move the selected secrets to"
      });
      return;
    }

    const results: MoveResults = [];
    const selectedCount =
      Object.keys(secrets).length + Object.keys(rotations).length + Object.keys(folders).length;
    let selectedPluralNoun = moveCopy.noun;
    let selectedNoun = selectedPluralNoun.slice(0, -1);
    if (moveCopy.noun === "items") selectedNoun = "item";
    if (Object.keys(rotations).length === selectedCount) {
      selectedNoun = "secret rotation";
      selectedPluralNoun = "secret rotations";
    }

    const secretsByEnv: Record<string, SecretV3RawSanitized[]> = Object.fromEntries(
      environments.map((env) => [env.slug, []])
    );

    Object.values(secrets).forEach((secretRecord) =>
      Object.entries(secretRecord).forEach(([env, secret]) => {
        if (secret.isRotatedSecret || secret.isHoneyTokenSecret) return;
        secretsByEnv[env].push(secret);
      })
    );

    const rotationsByEnv: Record<string, TSecretRotationV2[]> = Object.fromEntries(
      environments.map((env) => [env.slug, []])
    );

    Object.values(rotations).forEach((rotationRecord) =>
      Object.entries(rotationRecord).forEach(([env, rotation]) => {
        rotationsByEnv[env].push(rotation);
      })
    );

    const foldersByEnv: Record<string, TSecretFolder[]> = Object.fromEntries(
      environments.map((env) => [env.slug, []])
    );

    Object.values(folders).forEach((folderRecord) =>
      Object.entries(folderRecord).forEach(([env, folder]) => {
        if (foldersByEnv[env]) foldersByEnv[env].push(folder);
      })
    );

    // eslint-disable-next-line no-restricted-syntax
    for await (const environment of environments) {
      const envSlug = environment.slug;

      const { cannotMoveSecrets, cannotMoveRotations } = moveEligibility[envSlug];

      const foldersToMove = foldersByEnv[envSlug];

      if (cannotMoveSecrets && cannotMoveRotations && !foldersToMove.length) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const secretsToMove = cannotMoveSecrets ? [] : secretsByEnv[envSlug];
      const rotationsToMove = cannotMoveRotations ? [] : rotationsByEnv[envSlug];

      if (!secretsToMove.length && !rotationsToMove.length && !foldersToMove.length) {
        results.push({
          name: environment.name,
          message:
            selectedCount === 1
              ? `The selected ${selectedNoun} isn't in this environment.`
              : `None of the selected ${selectedPluralNoun} are in this environment.`,
          status: MoveResult.Info,
          id: environment.id
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      if (secretsToMove.length) {
        try {
          const { isDestinationUpdated, isSourceUpdated } = await moveSecrets.mutateAsync({
            shouldOverwrite: data.shouldOverwrite,
            sourceEnvironment: environment.slug,
            sourceSecretPath,
            destinationEnvironment: environment.slug,
            destinationSecretPath: selectedPath.secretPath,
            projectId,
            projectSlug,
            secretIds: secretsToMove.map((sec) => sec.id)
          });

          let message = "";
          let status: MoveResult = MoveResult.Info;

          if (isDestinationUpdated && isSourceUpdated) {
            message = `${secretsToMove.length} ${secretsToMove.length === 1 ? "secret" : "secrets"} moved.`;
            status = MoveResult.Success;
          } else if (isDestinationUpdated) {
            message =
              "Successfully created secrets in destination. A secret approval request has been generated for the source.";
          } else if (isSourceUpdated) {
            message = "A secret approval request has been generated in the destination";
          } else {
            message =
              "A secret approval request has been generated in both the source and the destination.";
          }

          results.push({
            name: environment.name,
            message,
            status,
            id: environment.id
          });
        } catch (error) {
          let errorMessage = (error as Error)?.message ?? "Failed to move secrets";
          if (axios.isAxiosError(error)) {
            const { message } = error?.response?.data as { message: string };
            if (message) errorMessage = message;
          }

          results.push({
            name: environment.name,
            message: errorMessage,
            status: MoveResult.Error,
            id: environment.id
          });
        }
      }

      // eslint-disable-next-line no-restricted-syntax
      for await (const rotation of rotationsToMove) {
        try {
          await moveSecretRotation.mutateAsync({
            type: rotation.type,
            rotationId: rotation.id,
            destinationEnvironment: environment.slug,
            destinationSecretPath: selectedPath.secretPath,
            overwriteDestination: data.shouldOverwrite,
            projectId,
            secretPath: sourceSecretPath
          });

          results.push({
            name: `${environment.name} / ${rotation.name}`,
            message: "Secret rotation moved.",
            status: MoveResult.Success,
            id: `${environment.id}-${rotation.id}`
          });
        } catch (error) {
          let errorMessage = (error as Error)?.message ?? "Failed to move secret rotation";
          if (axios.isAxiosError(error)) {
            const responseMessage = (error?.response?.data as { message?: string })?.message;
            if (responseMessage) errorMessage = responseMessage;
          }

          results.push({
            name: `${environment.name} / ${rotation.name}`,
            message: errorMessage,
            status: MoveResult.Error,
            id: `${environment.id}-${rotation.id}`
          });
        }
      }

      // eslint-disable-next-line no-restricted-syntax
      for await (const folder of foldersToMove) {
        try {
          const { hasApprovalRequests } = await moveFolder.mutateAsync({
            projectId,
            folderId: folder.id,
            sourceEnvironment: environment.slug,
            sourcePath: sourceSecretPath,
            destinationEnvironment: environment.slug,
            destinationPath: selectedPath.secretPath,
            shouldOverwrite: data.shouldOverwrite
          });

          results.push({
            name: `${environment.name} / ${folder.name}`,
            message: hasApprovalRequests
              ? "Folder moved. Approval requests were generated for change-policy protected paths."
              : "Folder moved.",
            status: hasApprovalRequests ? MoveResult.Info : MoveResult.Success,
            id: `${environment.id}-folder-${folder.id}`
          });
        } catch (error) {
          let errorMessage = (error as Error)?.message ?? "Failed to move folder";
          if (axios.isAxiosError(error)) {
            const responseMessage = (error?.response?.data as { message?: string })?.message;
            if (responseMessage) errorMessage = responseMessage;
          }

          results.push({
            name: `${environment.name} / ${folder.name}`,
            message: errorMessage,
            status: MoveResult.Error,
            id: `${environment.id}-folder-${folder.id}`
          });
        }
      }
    }

    setMoveResults(results);
    onResults();
  };

  useEffect(() => {
    return () => {
      if (moveResults) onComplete();
    };
  }, [moveResults]);

  if (moveResults) {
    return <MoveResultsView moveResults={moveResults} onComplete={onComplete} />;
  }

  if (moveSecrets.isPending || moveSecretRotation.isPending || moveFolder.isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <LoaderCircleIcon className="size-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-accent">Moving {moveCopy.noun}...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <MoveLocationLayout
          sourceEnvironment={
            <StaticLocationValue accessibleLabel="Source environments">
              <span className="truncate">{environments.length} environments</span>
            </StaticLocationValue>
          }
          sourceSecretPath={sourceSecretPath}
          destinationEnvironment={
            <StaticLocationValue accessibleLabel="Destination environments">
              <span className="truncate">Same environments</span>
            </StaticLocationValue>
          }
          destinationPath={
            <DestinationPathField
              hideLabel
              inputId="move-secret-path-multi"
              pathEnvironments={environments}
              creationEnvironments={folderCreationEnvironments}
              projectId={projectId}
              value={selectedPath}
              onChange={setSelectedPath}
              isCreating={isCreatingFolder}
              onCreatingChange={setIsCreatingFolder}
              isCandidateBlocked={(destinationPath) =>
                buildDestinationTargets({ movedFolders, sourceSecretPath, destinationPath })
                  .isSelfMove
              }
            />
          }
        />
        <FieldDescription isOpen>
          To move {moveCopy.noun} between environments, select a single environment before opening
          Move.
        </FieldDescription>
      </div>
      {Boolean(environmentsToBeSkipped.length) && (
        <Alert variant="danger">
          <CircleAlertIcon />
          <AlertTitle>The following environments will not be affected</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {environmentsToBeSkipped.map((env) => (
                <li key={env.id}>{env.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <MoveBlockAlerts
        isSelfMove={isSelfMove}
        isDestinationBlocked={isDestinationBlocked}
        blockedDestinations={blockedDestinations}
        environments={environments}
      />
      <FolderRbacPoliciesWarning folderNames={foldersWithRbacPolicies} />
      <DialogFooter className="items-center">
        {showOverwriteOption && (
          <Controller
            control={control}
            name="shouldOverwrite"
            render={({ field: { value, onChange } }) => (
              <OverwriteControl
                id="overwrite-checkbox-multi"
                isChecked={value}
                isDisabled={isSubmitting || isCreatingFolder}
                onCheckedChange={onChange}
              />
            )}
          />
        )}
        <DialogClose asChild>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogClose>
        <Button
          variant="project"
          onClick={handleSubmit(handleFormSubmit)}
          isDisabled={
            !destinationSelected ||
            isSubmitting ||
            isCreatingFolder ||
            isSelfMove ||
            isCheckingDestination ||
            isDestinationBlocked
          }
          isPending={isSubmitting}
        >
          {moveCopy.action}
        </Button>
      </DialogFooter>
    </div>
  );
};

// when a folder cannot be moved the backend tells us which resource blocks it (and where), so we can
// surface the concrete action the user needs to take to unblock the move.
const formatFolderMoveBlock = ({
  blockingType,
  blockingPath
}: {
  blockingType?: FolderMoveBlockingType;
  blockingPath?: string;
}) => {
  if (!blockingType) {
    return "This folder contains a resource you don't have permission to view, so it cannot be moved.";
  }

  const at = blockingPath ? ` at "${blockingPath}"` : "";

  switch (blockingType) {
    case "secret_rotation":
      return `A secret rotation exists${at}. Delete the rotation to move this folder.`;
    case "dynamic_secret":
      return `A dynamic secret exists${at}. Delete the dynamic secret to move this folder.`;
    case "honey_token":
      return `A honey token exists${at}. Delete the honey token to move this folder.`;
    case "secret_import":
      return `A secret import exists${at}. Remove the import to move this folder.`;
    case "secret_approval_policy":
    default:
      return `A secret approval policy applies${at}. Remove or adjust the policy to move this folder.`;
  }
};

const FolderMoveBlockedView = ({
  blockedFolders,
  onClose
}: {
  blockedFolders: {
    folderName: string;
    blockingType?: FolderMoveBlockingType;
    blockingPath?: string;
  }[];
  onClose: () => void;
}) => {
  return (
    <div className="w-full">
      <Alert variant="danger">
        <CircleAlertIcon />
        <AlertTitle>This folder can&apos;t be moved</AlertTitle>
        <AlertDescription>
          <ul className="list-disc pl-4">
            {blockedFolders.map((folder) => (
              <li key={folder.folderName}>{formatFolderMoveBlock(folder)}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
      <DialogFooter className="mt-6">
        <DialogClose asChild>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
};

export const MoveSecretsModal = ({ isOpen, onOpenChange, visibleEnvs, ...props }: Props) => {
  const [hasMoveResults, setHasMoveResults] = useState(false);
  useEffect(() => {
    if (!isOpen) setHasMoveResults(false);
  }, [isOpen]);
  // the dialog plays a close animation, but the props that drive the body (folders/secrets/rotations)
  // are cleared the instant the modal closes (the popup's `data` is dropped). snapshot the props while
  // the modal is open so the body keeps rendering the same view through the close animation rather than
  // flashing a different view as it fades out.
  const snapshotRef = useRef(props);
  if (isOpen) snapshotRef.current = props;
  const contentProps = snapshotRef.current;
  const { folders } = contentProps;

  const isSingleEnvMode = visibleEnvs.length === 1;
  const moveCopy = getMoveSelectionCopy(contentProps);
  let dialogDescription = isSingleEnvMode
    ? `Move the selected ${moveCopy.noun} to another project location.`
    : `Move the selected ${moveCopy.noun} to the same folder location across environments.`;
  if (hasMoveResults) dialogDescription = "Review what happened in each environment.";

  const folderIds = Object.values(folders).flatMap((perEnv) =>
    Object.values(perEnv).map((folder) => folder.id)
  );
  const hasFolders = folderIds.length > 0;

  // gate the eligibility check on `isOpen` so selecting a folder never triggers the call, while the
  // snapshot keeps `folderIds` populated so the rendered view stays stable through the close animation
  const { isChecking, canMove, blockedFolders, foldersWithRbacPolicies } =
    useGetFoldersMoveEligibility(folderIds, isOpen);

  const renderContent = () => {
    if (hasFolders && isChecking) {
      return (
        <div className="flex h-full flex-col items-center justify-center py-2.5">
          <LoaderCircleIcon className="size-8 animate-spin text-accent" />
          <p className="mt-4 text-sm text-accent">Checking whether this folder can be moved...</p>
        </div>
      );
    }

    if (hasFolders && !canMove) {
      return (
        <FolderMoveBlockedView
          blockedFolders={blockedFolders}
          onClose={() => onOpenChange(false)}
        />
      );
    }

    if (isSingleEnvMode) {
      return (
        <SingleEnvContent
          {...contentProps}
          visibleEnvs={visibleEnvs}
          foldersWithRbacPolicies={foldersWithRbacPolicies}
          onClose={() => onOpenChange(false)}
        />
      );
    }

    return (
      <MultiEnvContent
        {...contentProps}
        visibleEnvs={visibleEnvs}
        foldersWithRbacPolicies={foldersWithRbacPolicies}
        onClose={() => onOpenChange(false)}
        onResults={() => setHasMoveResults(true)}
      />
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) setHasMoveResults(false);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{hasMoveResults ? "Move summary" : moveCopy.title}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
};
