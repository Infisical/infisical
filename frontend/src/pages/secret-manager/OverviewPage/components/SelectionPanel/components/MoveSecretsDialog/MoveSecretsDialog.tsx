import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { InputActionMeta, OptionProps, SingleValue, SingleValueProps } from "react-select";
import { components as reactSelectComponents } from "react-select";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CheckCircleIcon,
  CheckIcon,
  CircleAlertIcon,
  FolderPlusIcon,
  InfoIcon,
  KeyRoundIcon,
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
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { CreatableSelect } from "@app/components/v3/generic/ReactSelect";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions
} from "@app/context/ProjectPermissionContext/types";
import { removeTrailingSlash } from "@app/helpers/string";
import { useDebounce } from "@app/hooks";
import { useMoveSecrets } from "@app/hooks/api";
import { useGetProjectSecretsQuickSearch } from "@app/hooks/api/dashboard";
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
import { useGetOrCreateFolder, useMoveFolder } from "@app/hooks/api/secretFolders";
import { TSecretFolder } from "@app/hooks/api/secretFolders/types";
import { TSecretRotationV2, useMoveSecretRotation } from "@app/hooks/api/secretRotationsV2";
import { fetchSecretReferences, secretKeys } from "@app/hooks/api/secrets/queries";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  environments: ProjectEnv[];
  visibleEnvs: ProjectEnv[];
  projectId: string;
  projectSlug: string;
  sourceSecretPath: string;
  secrets: Record<string, Record<string, SecretV3RawSanitized>>;
  rotations: Record<string, Record<string, TSecretRotationV2>>;
  folders: Record<string, Record<string, TSecretFolder>>;
  onComplete: () => void;
};

type ContentProps = Omit<Props, "isOpen" | "onOpenChange"> & {
  onClose: () => void;
};

type OptionValue = {
  secretPath: string;
  __isNew__?: boolean;
  isCreateOption?: boolean;
  createDisabledReason?: string;
};

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

const PathSegments = ({ secretPath }: { secretPath: string }) => {
  const segments = getPathSegments(secretPath);

  if (secretPath === "/" || segments.every((segment) => !segment)) {
    return <span className="text-muted">Root</span>;
  }

  return (
    <span className="inline-flex min-w-0 items-center font-mono">
      {segments.map((segment, index) => (
        <span
          key={segments.slice(0, index + 1).join("/")}
          className="inline-flex min-w-0 items-center"
        >
          {index > 0 && (
            <span className="mx-1 text-muted/60" aria-hidden="true">
              /
            </span>
          )}
          <span className="truncate">{segment}</span>
        </span>
      ))}
    </span>
  );
};

const PathSingleValue = (props: SingleValueProps<OptionValue>) => {
  const { data } = props;

  return (
    <reactSelectComponents.SingleValue {...props}>
      <PathSegments secretPath={data.secretPath} />
    </reactSelectComponents.SingleValue>
  );
};

const PathOption = (props: OptionProps<OptionValue>) => {
  const { data, isDisabled, isSelected } = props;

  return (
    <reactSelectComponents.Option {...props}>
      <div
        className={twMerge(
          "flex cursor-pointer items-center justify-between gap-2",
          isDisabled && "cursor-not-allowed opacity-50"
        )}
      >
        {data.isCreateOption ? (
          <>
            <div className="min-w-0 flex-1">
              <PathSegments secretPath={data.secretPath} />
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
              <FolderPlusIcon className="size-3.5" />
              <span>New Folder</span>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <PathSegments secretPath={data.secretPath} />
          </div>
        )}
        {!data.isCreateOption && isSelected && <CheckIcon className="size-4 shrink-0" />}
      </div>
    </reactSelectComponents.Option>
  );
};

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
  onCreatingChange
}: {
  pathEnvironments: ProjectEnv[];
  creationEnvironments: ProjectEnv[];
  projectId: string;
  inputId: string;
  value: OptionValue | null;
  onChange: (newValue: OptionValue | null) => void;
  isCreating: boolean;
  onCreatingChange: (isCreating: boolean) => void;
}) => {
  const { permission } = useProjectPermission();
  const getOrCreateFolder = useGetOrCreateFolder();
  const queryClient = useQueryClient();
  const createRequestRef = useRef(false);
  const [inputPath, setInputPath] = useState("");
  const searchPath = getAbsolutePath(inputPath);
  const [debouncedSearchPath] = useDebounce(searchPath);

  const { data, isPending, isLoading, isFetching } = useGetProjectSecretsQuickSearch({
    secretPath: "/",
    environments: pathEnvironments.map((environment) => environment.slug),
    projectId,
    search: debouncedSearchPath,
    tags: {}
  });

  const { folders = {} } = data ?? {};
  const options = Object.keys(folders).map((secretPath) => ({ secretPath }));
  const candidatePath = getAbsolutePath(inputPath);
  const candidateSegments = getPathSegments(inputPath);
  const candidateParentPaths = candidateSegments.map((_, index) =>
    index === 0 ? "/" : `/${candidateSegments.slice(0, index).join("/")}`
  );
  const isCandidateValid = isValidFolderPath(inputPath);
  const isRootPath = inputPath.trim() === "";
  const isSearching = isPending || isLoading || isFetching || searchPath !== debouncedSearchPath;
  const matchesExistingFolder =
    !isRootPath &&
    (value?.secretPath === candidatePath ||
      options.some((option) => option.secretPath === candidatePath));

  const restrictedEnvironments = isCandidateValid
    ? creationEnvironments.filter((environment) =>
        candidateParentPaths.some((parentPath) =>
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
    !isSearching &&
    !isCreating &&
    creationEnvironments.length > 0 &&
    restrictedEnvironments.length === 0;

  let disabledReason = "Type a new folder name";
  if (creationEnvironments.length === 0) {
    disabledReason = "No selected environments can create this folder";
  } else if (restrictedEnvironments.length > 0) {
    disabledReason = `You don't have permission to create folders in ${restrictedEnvironments
      .map(({ name }) => name)
      .join(", ")}`;
  } else if (inputPath && !isCandidateValid) {
    disabledReason = "Folder names can only contain letters, numbers, dashes, and underscores";
  } else if (isRootPath) {
    disabledReason = "Type a new folder name";
  } else if (isSearching) {
    disabledReason = "Checking whether this folder already exists";
  } else if (matchesExistingFolder) {
    disabledReason = "This folder already exists";
  } else if (isCreating) {
    disabledReason = "Creating folder";
  }

  const handleInputChange = (nextValue: string, { action }: InputActionMeta) => {
    if (action !== "input-change") return inputPath;

    const nextPath = normalizeFolderPathInput(nextValue);
    setInputPath(nextPath);
    if (value?.secretPath !== getAbsolutePath(nextPath)) onChange(null);
    return nextPath;
  };

  const showSelectedPathInput = () => {
    if (value?.secretPath && value.secretPath !== "/" && !inputPath) {
      setInputPath(normalizeFolderPathInput(value.secretPath));
    }
  };

  const restoreSelectedPathValue = () => {
    if (value) setInputPath("");
  };

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
        const results = await Promise.allSettled(
          creationEnvironments.map((environment) =>
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

      if (didCreateAllFolders) {
        await queryClient.invalidateQueries({
          queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath: "/" })
        });
        setInputPath("");
        onChange({ secretPath: absolutePath });
      }
    } finally {
      createRequestRef.current = false;
      onCreatingChange(false);
    }
  };

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>Destination folder</FieldLabel>
      <FieldContent>
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-3 shrink-0 text-center font-mono text-accent" aria-hidden="true">
            /
          </span>
          <div className="min-w-0 flex-1">
            <CreatableSelect<OptionValue>
              inputId={inputId}
              allowCreateWhileLoading
              components={{ Option: PathOption, SingleValue: PathSingleValue }}
              createOptionPosition="last"
              inputValue={inputPath}
              isDisabled={isCreating}
              isLoading={isSearching}
              isOptionDisabled={(option) => Boolean(option.isCreateOption) && !canCreate}
              isValidNewOption={(nextInputValue) => {
                const nextPath = normalizeFolderPathInput(nextInputValue);
                const nextAbsolutePath = getAbsolutePath(nextPath);

                return (
                  Boolean(nextPath) &&
                  value?.secretPath !== nextAbsolutePath &&
                  !options.some((option) => option.secretPath === nextAbsolutePath)
                );
              }}
              options={options}
              value={value}
              onBlur={restoreSelectedPathValue}
              onChange={(nextValue) => {
                const option = nextValue as SingleValue<OptionValue>;
                if (!option || option.isCreateOption) return;
                setInputPath("");
                onChange(option);
              }}
              onCreateOption={handleCreatePath}
              onFocus={showSelectedPathInput}
              onInputChange={handleInputChange}
              onMenuClose={restoreSelectedPathValue}
              onMenuOpen={showSelectedPathInput}
              getNewOptionData={(nextInputValue) => ({
                secretPath: getAbsolutePath(nextInputValue),
                __isNew__: true,
                isCreateOption: true,
                createDisabledReason: canCreate ? undefined : disabledReason
              })}
              getOptionLabel={(option) => {
                if (option.isCreateOption) {
                  return `New Folder: ${
                    option.createDisabledReason ?? stripLeadingSlashes(option.secretPath)
                  }`;
                }
                return option.secretPath === "/" ? "Root" : stripLeadingSlashes(option.secretPath);
              }}
              getOptionValue={(option) => option.secretPath}
              placeholder="Root"
            />
          </div>
        </div>
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

const SecretMoveReferenceWarning = ({
  secrets,
  sourceEnvironment,
  sourceSecretPath,
  projectId
}: {
  secrets: Record<string, Record<string, SecretV3RawSanitized>>;
  sourceEnvironment: string;
  sourceSecretPath: string;
  projectId: string;
}) => {
  const secretsToMove = Object.values(secrets)
    .map((secretRecord) => secretRecord[sourceEnvironment])
    .filter((secret): secret is SecretV3RawSanitized => Boolean(secret));

  const referenceQueries = useQueries({
    queries: secretsToMove.map((secret) => ({
      queryKey: secretKeys.getSecretReferences({
        secretKey: secret.key,
        secretPath: sourceSecretPath,
        environment: sourceEnvironment,
        projectId
      }),
      queryFn: () =>
        fetchSecretReferences({
          secretKey: secret.key,
          secretPath: sourceSecretPath,
          environment: sourceEnvironment,
          projectId
        })
    }))
  });

  const references = referenceQueries
    .flatMap((query, index) => {
      if (!query.data?.tree) return [];

      return query.data.tree.children.map((reference) => ({
        secretKey: reference.key,
        environment: reference.environment,
        secretPath: reference.secretPath,
        movedSecretKey: secretsToMove[index].key
      }));
    })
    .filter(
      (reference, index, allReferences) =>
        index ===
        allReferences.findIndex(
          (candidate) =>
            candidate.secretKey === reference.secretKey &&
            candidate.environment === reference.environment &&
            candidate.secretPath === reference.secretPath &&
            candidate.movedSecretKey === reference.movedSecretKey
        )
    );

  if (referenceQueries.some((query) => query.isLoading) || references.length === 0) return null;

  return (
    <div className="mt-4 min-w-0">
      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertTitle>
          {references.length} secret reference{references.length === 1 ? "" : "s"} will be updated
        </AlertTitle>
        <AlertDescription>
          Referencing secrets will be updated to use the new path after this move.
        </AlertDescription>
      </Alert>
      <div className="mt-3 max-h-40 thin-scrollbar overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-popover">
            <TableRow>
              <TableHead className="w-10" aria-label="Type" />
              <TableHead>Environment</TableHead>
              <TableHead isTruncatable>Path</TableHead>
              <TableHead isTruncatable>Secret Key</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {references.map((reference) => (
              <TableRow
                key={`${reference.secretKey}-${reference.environment}-${reference.secretPath}-${reference.movedSecretKey}`}
              >
                <TableCell>
                  <KeyRoundIcon className="size-4 text-secret" aria-hidden="true" />
                </TableCell>
                <TableCell>{reference.environment}</TableCell>
                <TableCell isTruncatable title={reference.secretPath}>
                  {reference.secretPath}
                </TableCell>
                <TableCell isTruncatable title={reference.secretKey}>
                  {reference.secretKey}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
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
      <div className="mb-2 text-sm font-medium">Results</div>
      <div className="mb-4 flex flex-col divide-y divide-border rounded-md border border-border bg-container px-2 py-2">
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
            <div key={id} className="flex items-start gap-2 p-2 text-sm">
              <Icon className={twMerge(resultClassName, "mt-0.5 size-3.5 shrink-0")} />
              <span>
                {name}: {message}
              </span>
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" onClick={() => onComplete()}>
            Dismiss
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
  if (blocked.policyName && blocked.blockingPath) {
    return `At environment ${envName} the path "${blocked.blockingPath}" is governed by the secret approval policy "${blocked.policyName}", so "${blocked.folderName}" cannot be moved there.`;
  }
  return `At environment ${envName} the destination is governed by a secret approval policy, so "${blocked.folderName}" cannot be moved there.`;
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
      <Alert variant="danger" className="mt-4">
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
      <Alert variant="danger" className="mt-4">
        <CircleAlertIcon />
        <AlertTitle>Could not verify the destination</AlertTitle>
        <AlertDescription>
          We could not verify whether the destination allows this move. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="danger" className="mt-4">
      <CircleAlertIcon />
      <AlertTitle>The destination is protected by a secret approval policy</AlertTitle>
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
  sourceSecretPath
}: ContentProps) => {
  const sourceEnv = visibleEnvs[0];
  const moveCopy = getMoveSelectionCopy({ secrets, rotations, folders });
  const showOverwriteOption = Object.keys(secrets).length > 0 || Object.keys(rotations).length > 0;
  const moveSecrets = useMoveSecrets();
  const moveSecretRotation = useMoveSecretRotation();
  const moveFolder = useMoveFolder();
  const [selectedPath, setSelectedPath] = useState<OptionValue | null>({
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
    setSelectedPath({ secretPath: "/" });
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
    <div>
      <Controller
        control={control}
        name="environment"
        render={({ field: { onChange, value } }) => (
          <Field>
            <FieldLabel>Environment</FieldLabel>
            <FieldContent>
              <Select value={value} onValueChange={onChange} disabled={isCreatingFolder}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select environment" />
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
      <div className="mt-4">
        <DestinationPathField
          key={selectedEnvironment}
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
        />
      </div>
      <SecretMoveReferenceWarning
        secrets={secrets}
        sourceEnvironment={sourceEnv.slug}
        sourceSecretPath={sourceSecretPath}
        projectId={projectId}
      />
      <MoveBlockAlerts
        isSelfMove={isSelfMove}
        isDestinationBlocked={isDestinationBlocked}
        blockedDestinations={blockedDestinations}
        environments={environments}
      />
      {showOverwriteOption && (
        <Controller
          control={control}
          name="shouldOverwrite"
          render={({ field: { onBlur, value, onChange } }) => (
            <div className="mt-4 flex justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-fit">
                    <Field orientation="horizontal">
                      <Checkbox
                        id="overwrite-checkbox"
                        isChecked={value}
                        onCheckedChange={onChange}
                        onBlur={onBlur}
                        variant="project"
                      />
                      <FieldLabel htmlFor="overwrite-checkbox" className="cursor-pointer">
                        Overwrite existing secrets
                      </FieldLabel>
                    </Field>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  {value
                    ? "Secrets with conflicting keys at the destination will be overwritten"
                    : "Secrets with conflicting keys at the destination will not be overwritten"}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        />
      )}
      <DialogFooter className="mt-6">
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
  secrets,
  rotations,
  folders,
  environments,
  projectId,
  projectSlug,
  sourceSecretPath
}: ContentProps) => {
  const moveSecrets = useMoveSecrets();
  const moveSecretRotation = useMoveSecretRotation();
  const moveFolder = useMoveFolder();
  const moveCopy = getMoveSelectionCopy({ secrets, rotations, folders });
  const showOverwriteOption = Object.keys(secrets).length > 0 || Object.keys(rotations).length > 0;
  const { permission } = useProjectPermission();
  const [moveResults, setMoveResults] = useState<MoveResults | null>(null);
  const [selectedPath, setSelectedPath] = useState<OptionValue | null>({
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
          message: "Nothing selected in environment",
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
            message = "Successfully moved selected secrets";
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
            message: "Successfully moved secret rotation",
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
              : "Successfully moved folder",
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
    <div>
      <Alert variant="info" className="mb-4">
        <InfoIcon />
        <AlertTitle>
          Select a single environment to move {moveCopy.noun} across environments.
        </AlertTitle>
      </Alert>
      <DestinationPathField
        inputId="move-secret-path-multi"
        pathEnvironments={environments}
        creationEnvironments={folderCreationEnvironments}
        projectId={projectId}
        value={selectedPath}
        onChange={setSelectedPath}
        isCreating={isCreatingFolder}
        onCreatingChange={setIsCreatingFolder}
      />
      {Boolean(environmentsToBeSkipped.length) && (
        <Alert variant="danger" className="mt-4">
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
      {showOverwriteOption && (
        <Controller
          control={control}
          name="shouldOverwrite"
          render={({ field: { onBlur, value, onChange } }) => (
            <div className="mt-4 flex justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-fit">
                    <Field orientation="horizontal">
                      <Checkbox
                        id="overwrite-checkbox-multi"
                        isChecked={value}
                        onCheckedChange={onChange}
                        onBlur={onBlur}
                        variant="project"
                      />
                      <FieldLabel htmlFor="overwrite-checkbox-multi" className="cursor-pointer">
                        Overwrite existing secrets
                      </FieldLabel>
                    </Field>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  {value
                    ? "Secrets with conflicting keys at the destination will be overwritten"
                    : "Secrets with conflicting keys at the destination will not be overwritten"}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        />
      )}
      <DialogFooter className="mt-6">
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

  const folderIds = Object.values(folders).flatMap((perEnv) =>
    Object.values(perEnv).map((folder) => folder.id)
  );
  const hasFolders = folderIds.length > 0;

  // gate the eligibility check on `isOpen` so selecting a folder never triggers the call, while the
  // snapshot keeps `folderIds` populated so the rendered view stays stable through the close animation
  const { isChecking, canMove, blockedFolders } = useGetFoldersMoveEligibility(folderIds, isOpen);

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
          onClose={() => onOpenChange(false)}
        />
      );
    }

    return (
      <MultiEnvContent
        {...contentProps}
        visibleEnvs={visibleEnvs}
        onClose={() => onOpenChange(false)}
      />
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
        else onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-xl overflow-visible [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{moveCopy.title}</DialogTitle>
          <DialogDescription>
            {isSingleEnvMode
              ? `Move the selected ${moveCopy.noun} to a new environment and folder location`
              : `Move the selected ${moveCopy.noun} across all environments to a new folder location`}
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
};
