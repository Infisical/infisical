import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subject } from "@casl/ability";
import axios from "axios";
import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CircleXIcon,
  CodeXmlIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  FolderOpenIcon,
  InfoIcon,
  KeyRoundIcon,
  MessageSquareIcon,
  TagsIcon,
  WrapTextIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldLabel,
  FileDropzone,
  IconButton,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableVirtualBody,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import {
  useCreateFolder,
  useCreateSecretBatch,
  useGetOrCreateFolder,
  useUpdateSecretBatch
} from "@app/hooks/api";
import { fetchProjectFolders } from "@app/hooks/api/secretFolders/queries";
import { fetchProjectSecrets, mergePersonalSecrets } from "@app/hooks/api/secrets/queries";
import { useCreateWsTag, useGetWsTags } from "@app/hooks/api/tags/queries";
import { ApiErrorTypes, SecretType } from "@app/hooks/api/types";

import { CsvColumnMapContent } from "./CsvColumnMapDialog";
import {
  buildFolderTree,
  chunkSecretsByRequestSize,
  createFolderResolver,
  createRateLimitedQueue,
  flattenNestedJson,
  getNestedJsonObject,
  joinSecretPath,
  runNestedImport,
  TFolderNode,
  TQueueProgress
} from "./parseNestedJson";
import { CsvData, parseSecretFile } from "./parseSecretFile";
import { PASTE_SECRETS_FORM_ID, PasteSecretsContent } from "./PasteSecretsDialog";
import { TParsedEnv } from "./types";

const MAX_BATCH_REQUEST_BYTES = 1024 * 1024;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  environments: { name: string; slug: string }[];
  projectId: string;
  secretPath: string;
  initialParsedSecrets?: TParsedEnv | null;
  initialFile?: File | null;
  initialStep?: "upload" | "paste";
  initialSelectedEnvironments?: { name: string; slug: string }[];
  onComplete?: (envSlugs: string[]) => void;
};

type TReviewRow =
  | { type: "folder"; id: string; depth: number; node: TFolderNode }
  | { type: "secret"; id: string; depth: number; key: string; secretData: TParsedEnv[string] };

const ImportKeyContent = ({ depth, children }: { depth?: number; children: ReactNode }) => (
  <div
    className="flex w-full items-center gap-2"
    style={depth === undefined ? undefined : { paddingInlineStart: `${depth * 1.5}rem` }}
  >
    {children}
  </div>
);

type ContentProps = {
  environments: { name: string; slug: string }[];
  projectId: string;
  secretPath: string;
  initialParsedSecrets?: TParsedEnv | null;
  initialFile?: File | null;
  initialStep?: "upload" | "paste";
  initialSelectedEnvironments?: { name: string; slug: string }[];
  onComplete?: (envSlugs: string[]) => void;
  onClose: () => void;
  onLockChange?: (isLocked: boolean) => void;
};

const ImportSecretsContent = ({
  environments,
  projectId,
  secretPath,
  initialParsedSecrets,
  initialFile,
  initialStep = "upload",
  initialSelectedEnvironments = [],
  onComplete,
  onClose,
  onLockChange
}: ContentProps) => {
  const { permission } = useProjectPermission();
  const [parsedSecrets, setParsedSecrets] = useState<TParsedEnv | null>(null);
  const [isImporting, setIsImporting] = useToggle();
  const isImportRunningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [nestedProgress, setNestedProgress] = useState<TQueueProgress | null>(null);
  const [importMethod, setImportMethod] = useState<"upload" | "paste">(initialStep);
  const [isPasteDirty, setIsPasteDirty] = useState(false);
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [visibleSecretKeys, setVisibleSecretKeys] = useState<Set<string>>(new Set());
  const [shouldOverwrite, setShouldOverwrite] = useState(false);
  const [keyOverrides, setKeyOverrides] = useState<Record<string, string>>({});
  const [nestedJson, setNestedJson] = useState<Record<string, unknown> | null>(null);
  const [shouldImportNested, setShouldImportNested] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const { mutateAsync: createSecretBatch } = useCreateSecretBatch();
  const { mutateAsync: updateSecretBatch } = useUpdateSecretBatch();
  // Nested imports retry rate-limited requests and report what still fails per folder, so a
  // 429 should not also raise a global toast
  const quietRateLimitOptions = {
    meta: { handledErrorCodes: [ApiErrorTypes.RateLimitError] }
  };
  const { mutateAsync: createNestedSecretBatch } = useCreateSecretBatch({
    options: quietRateLimitOptions
  });
  const { mutateAsync: updateNestedSecretBatch } = useUpdateSecretBatch({
    options: quietRateLimitOptions
  });
  const { mutateAsync: getOrCreateFolder } = useGetOrCreateFolder();
  // A create that loses a race with another writer is recovered as a reused folder, and any
  // other folder failure is listed in the import's own warning, so no toast per folder
  const { mutateAsync: createFolder } = useCreateFolder({
    meta: { handledErrorCodes: [ApiErrorTypes.BadRequestError, ApiErrorTypes.RateLimitError] }
  });
  const { mutateAsync: createWsTag } = useCreateWsTag();

  const canReadTags = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  const canCreateTags = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Tags);
  const { data: projectTags, isPending: isTagsLoading } = useGetWsTags(
    canReadTags ? projectId : ""
  );

  const allowedEnvironments = environments.filter((env) =>
    permission.can(
      ProjectPermissionSecretActions.Create,
      subject(ProjectPermissionSub.Secrets, {
        environment: env.slug,
        secretPath,
        secretName: "*",
        secretTags: ["*"]
      })
    )
  );
  const [selectedEnvs, setSelectedEnvs] = useState<{ name: string; slug: string }[]>(() => {
    const initialSlugs = new Set(initialSelectedEnvironments.map((env) => env.slug));
    return allowedEnvironments.filter((env) => initialSlugs.has(env.slug));
  });

  const activeSecrets = initialParsedSecrets || parsedSecrets;

  const nestedImport = useMemo(
    () => (nestedJson && shouldImportNested ? flattenNestedJson(nestedJson) : null),
    [nestedJson, shouldImportNested]
  );

  const folderTree = useMemo(
    () => (nestedImport ? buildFolderTree(nestedImport) : null),
    [nestedImport]
  );

  // Nested row ids are "<path>:<key>", which cannot collide because folder names and
  // nested secret keys never contain ":"
  const reviewRows = useMemo<TReviewRow[]>(() => {
    const toSecretRows = (secrets: TParsedEnv, depth: number, path?: string): TReviewRow[] =>
      Object.entries(secrets).map(([key, secretData]) => ({
        type: "secret",
        id: path ? `${path}:${key}` : key,
        depth,
        key,
        secretData
      }));
    if (!folderTree) return activeSecrets ? toSecretRows(activeSecrets, 0) : [];

    const toFolderRows = (node: TFolderNode, depth: number): TReviewRow[] => [
      { type: "folder", id: node.path, depth, node },
      ...(collapsedFolders.has(node.path)
        ? []
        : [
            ...toSecretRows(node.secrets, depth + 1, node.path),
            ...node.children.flatMap((child) => toFolderRows(child, depth + 1))
          ])
    ];
    return [
      ...toSecretRows(folderTree.secrets, 0, "/"),
      ...folderTree.children.flatMap((child) => toFolderRows(child, 0))
    ];
  }, [folderTree, activeSecrets, collapsedFolders]);

  const allSecretKeys = nestedImport
    ? Object.entries(nestedImport.secretsByPath).flatMap(([path, secrets]) =>
        Object.keys(secrets).map((key) => `${path}:${key}`)
      )
    : Object.keys(activeSecrets ?? {});
  const secretCount = allSecretKeys.length;
  const folderCount = nestedImport?.folderPaths.length ?? 0;
  const folderSummary = nestedImport
    ? ` across ${folderCount} folder${folderCount !== 1 ? "s" : ""}`
    : "";
  const hasNestedErrors = Boolean(nestedImport?.errors.length);
  const areAllFoldersCollapsed = Boolean(
    nestedImport?.folderPaths.length &&
      nestedImport.folderPaths.every((path) => collapsedFolders.has(path))
  );

  const toggleFolder = (path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAllFolders = () => {
    setCollapsedFolders(
      areAllFoldersCollapsed ? new Set() : new Set(nestedImport?.folderPaths ?? [])
    );
  };
  const hasTagsToResolve = activeSecrets
    ? Object.values(activeSecrets).some((s) => s.tagSlugs?.length)
    : false;
  const isWaitingForTags = canReadTags && hasTagsToResolve && isTagsLoading;
  const hasInvalidKey = activeSecrets
    ? Object.entries(activeSecrets).some(
        ([key, s]) => s.isFileSecret && !(keyOverrides[key] ?? key).trim()
      )
    : false;
  const isOverRequestLimit = useMemo(() => {
    // Nested imports are size-checked at upload, once each folder's real batches are known
    if (!activeSecrets || nestedImport) return false;
    const payload = JSON.stringify({
      projectId,
      environment: selectedEnvs.reduce(
        (longest, env) => (env.slug.length > longest.length ? env.slug : longest),
        ""
      ),
      secretPath,
      secrets: Object.entries(activeSecrets).map(([key, s]) => ({
        secretKey: keyOverrides[key] ?? key,
        secretValue: s.value,
        secretComment: s.comments.join("\n"),
        type: SecretType.Shared,
        tagIds: s.tagSlugs?.map(() => "00000000-0000-0000-0000-000000000000"),
        secretMetadata: s.secretMetadata,
        skipMultilineEncoding: s.skipMultilineEncoding
      }))
    });
    return new TextEncoder().encode(payload).length > MAX_BATCH_REQUEST_BYTES;
  }, [activeSecrets, keyOverrides, nestedImport, projectId, secretPath, selectedEnvs]);

  // A nested upload can run for minutes while it waits out rate limits, so the sheet stays open
  // until it finishes, and anything still queued is dropped if the sheet unmounts anyway
  const isNestedUploadRunning = isImporting && Boolean(nestedImport);
  useEffect(() => {
    onLockChange?.(isNestedUploadRunning);
  }, [isNestedUploadRunning, onLockChange]);
  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const handleParsedSecrets = useCallback((env: TParsedEnv, jsonSource?: string) => {
    if (!Object.keys(env).length) {
      createNotification({
        type: "error",
        text: "No secrets found in the provided data."
      });
      return;
    }
    setParsedSecrets(env);
    setNestedJson(getNestedJsonObject(jsonSource));
  }, []);

  const parseFile = useCallback(
    (file?: File) => {
      if (!file) {
        createNotification({
          text: "You can't inject files from VS Code. Click 'Reveal in finder', and drag your file directly from the directory where it's located.",
          type: "error"
        });
        return;
      }

      const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
      if (!isCsv && file.size > MAX_BATCH_REQUEST_BYTES) {
        createNotification({
          type: "error",
          text: "This file exceeds the 1 MB upload limit. Split it into smaller files."
        });
        return;
      }

      parseSecretFile(file, { onParsedSecrets: handleParsedSecrets, onCsvData: setCsvData });
    },
    [handleParsedSecrets]
  );

  useEffect(() => {
    if (initialFile) parseFile(initialFile);
  }, [initialFile, parseFile]);

  const handleImport = async () => {
    if (!activeSecrets || !selectedEnvs.length) return;

    if (isImportRunningRef.current) return;
    isImportRunningRef.current = true;
    setIsImporting.on();

    try {
      const requestedSlugs = new Set<string>();
      Object.values(activeSecrets).forEach((s) => {
        s.tagSlugs?.forEach((slug) => requestedSlugs.add(slug));
      });

      const slugToTagId = new Map<string, string>();
      (projectTags || []).forEach((t) => slugToTagId.set(t.slug, t.id));

      const missingSlugs = [...requestedSlugs].filter((slug) => !slugToTagId.has(slug));
      let skippedTagsCount = 0;

      if (missingSlugs.length) {
        if (canCreateTags) {
          const createdTags = await Promise.allSettled(
            missingSlugs.map((slug) => createWsTag({ projectId, tagSlug: slug, tagColor: "" }))
          );
          createdTags.forEach((result, idx) => {
            if (result.status === "fulfilled") {
              slugToTagId.set(result.value.slug, result.value.id);
            } else {
              skippedTagsCount += 1;
              // eslint-disable-next-line no-console
              console.error(`Failed to create tag ${missingSlugs[idx]}`, result.reason);
            }
          });
        } else {
          skippedTagsCount = missingSlugs.length;
        }
      }

      if (skippedTagsCount > 0) {
        createNotification({
          type: "warning",
          text: canCreateTags
            ? `Failed to create ${skippedTagsCount} tag${skippedTagsCount > 1 ? "s" : ""}; those tags were skipped.`
            : `${skippedTagsCount} tag${skippedTagsCount > 1 ? "s were" : " was"} skipped because ${skippedTagsCount > 1 ? "they don't" : "it doesn't"} exist and you don't have permission to create tags.`
        });
      }

      const resolveTagIds = (slugs?: string[]): string[] | undefined => {
        if (!slugs?.length) return undefined;
        const ids = slugs.map((s) => slugToTagId.get(s)).filter((id): id is string => Boolean(id));
        return ids.length ? ids : undefined;
      };

      const canCreateFolderIn = (environment: string, parentPath: string) =>
        permission.can(
          ProjectPermissionActions.Create,
          subject(ProjectPermissionSub.SecretFolders, {
            environment,
            secretPath: parentPath
          })
        );

      const ensureFolder = async (environment: string, path: string) => {
        if (path === "/") return;
        const pathSegment = path.split("/").filter(Boolean);
        const parentPath = `/${pathSegment.slice(0, -1).join("/")}`;
        const folderName = pathSegment.at(-1);

        if (folderName && parentPath && canCreateFolderIn(environment, parentPath)) {
          await getOrCreateFolder({
            projectId,
            path: parentPath,
            environment,
            name: folderName
          });
        }
      };

      const importSecretsAtPath = async (
        environment: string,
        path: string,
        secrets: TParsedEnv,
        // Only nested imports pass a queue; they also split batches by size
        enqueue?: <T>(request: () => Promise<T>) => Promise<T>
      ) => {
        // Fetch existing secrets to detect conflicts
        const fetchExisting = () =>
          fetchProjectSecrets({
            projectId,
            environment,
            secretPath: path,
            viewSecretValue: false
          });
        const { secrets: rawExisting } = await (enqueue ? enqueue(fetchExisting) : fetchExisting());

        const existingSecrets = mergePersonalSecrets(rawExisting);
        const existingKeys = new Set(existingSecrets.map((s) => s.key));

        // Resolve edited keys (file-based secrets can be renamed in the review table)
        const resolvedEntries = Object.entries(secrets).map(([origKey, secretData]) => ({
          finalKey: (secretData.isFileSecret ? (keyOverrides[origKey] ?? origKey) : origKey).trim(),
          secretData
        }));

        // Split secrets into creates vs updates
        const secretsToCreate = resolvedEntries
          .filter(({ finalKey }) => !existingKeys.has(finalKey))
          .map(({ finalKey, secretData }) => ({
            secretKey: finalKey,
            secretValue: secretData.value,
            secretComment: secretData.comments.join("\n") || "",
            type: SecretType.Shared,
            tagIds: resolveTagIds(secretData.tagSlugs),
            secretMetadata: secretData.secretMetadata?.length
              ? secretData.secretMetadata
              : undefined,
            skipMultilineEncoding: secretData.skipMultilineEncoding
          }));

        const secretsToUpdate = resolvedEntries
          .filter(({ finalKey }) => existingKeys.has(finalKey))
          .map(({ finalKey, secretData }) => ({
            secretKey: finalKey,
            secretValue: secretData.value,
            secretComment: secretData.comments.join("\n") || undefined,
            type: SecretType.Shared,
            tagIds: resolveTagIds(secretData.tagSlugs),
            secretMetadata: secretData.secretMetadata?.length
              ? secretData.secretMetadata
              : undefined,
            skipMultilineEncoding: secretData.skipMultilineEncoding
          }));

        if (!enqueue) {
          return {
            oversizedKeys: [] as string[],
            results: await Promise.allSettled([
              ...(secretsToCreate.length
                ? [
                    createSecretBatch({
                      projectId,
                      environment,
                      secretPath: path,
                      secrets: secretsToCreate
                    })
                  ]
                : []),
              ...(shouldOverwrite && secretsToUpdate.length
                ? [
                    updateSecretBatch({
                      projectId,
                      environment,
                      secretPath: path,
                      secrets: secretsToUpdate
                    })
                  ]
                : [])
            ])
          };
        }

        // Nested imports measure each real request and split any that would exceed the limit
        const envelope = { projectId, environment, secretPath: path };
        const creates = chunkSecretsByRequestSize(
          envelope,
          secretsToCreate,
          MAX_BATCH_REQUEST_BYTES
        );
        const updates = shouldOverwrite
          ? chunkSecretsByRequestSize(envelope, secretsToUpdate, MAX_BATCH_REQUEST_BYTES)
          : { chunks: [], oversized: [] };
        const oversizedKeys = [...creates.oversized, ...updates.oversized].map(
          ({ secretKey }) => secretKey
        );
        const results = await Promise.allSettled([
          ...creates.chunks.map((chunk) =>
            enqueue(() => createNestedSecretBatch({ ...envelope, secrets: chunk }))
          ),
          ...updates.chunks.map((chunk) =>
            enqueue(() => updateNestedSecretBatch({ ...envelope, secrets: chunk }))
          ),
          ...(oversizedKeys.length ? [Promise.reject(new Error("Secret exceeds 1 MB"))] : [])
        ]);
        return { oversizedKeys, results };
      };

      const describeOversizedKeys = (keys: string[]) => {
        if (!keys.length) return undefined;
        const names = keys.map((key) => `"${key}"`).join(", ");
        return keys.length === 1
          ? `secret ${names} is too large to import (over 1 MB) and was skipped`
          : `secrets ${names} are too large to import (over 1 MB) and were skipped`;
      };

      const writeSecrets = async (
        environment: string,
        path: string,
        secrets: TParsedEnv,
        enqueue?: <T>(request: () => Promise<T>) => Promise<T>
      ) => {
        const { results, oversizedKeys } = await importSecretsAtPath(
          environment,
          path,
          secrets,
          enqueue
        );
        const writtenCount = results.filter((r) => r.status === "fulfilled").length;
        let status: "written" | "partial" | "failed" = "partial";
        if (writtenCount === results.length) status = "written";
        else if (!writtenCount) status = "failed";
        return {
          status,
          hasApproval: results.some(
            (r) => r.status === "fulfilled" && "approval" in (r.value as object)
          ),
          reason: describeOversizedKeys(oversizedKeys)
        };
      };

      // One queue for the whole run, since every environment shares the same per-IP limit
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const enqueue = createRateLimitedQueue({
        getRateLimitDelayMs: (error) => {
          if (!axios.isAxiosError(error) || error.response?.status !== 429) return null;
          const retryAfter = Number(error.response.headers["retry-after"]);
          const ttlSeconds = Number(
            /in (\d+) seconds/.exec(String(error.response.data?.message ?? ""))?.[1]
          );
          const seconds = [retryAfter, ttlSeconds].find((n) => Number.isFinite(n) && n > 0) ?? 5;
          return Math.min(seconds, 60) * 1000;
        },
        signal: abortController.signal,
        onProgress: setNestedProgress
      });

      const envPromises = selectedEnvs.map(async (env) => {
        await ensureFolder(env.slug, secretPath);

        if (!nestedImport) {
          const { status, hasApproval } = await writeSecrets(env.slug, secretPath, activeSecrets);
          const isWritten = status === "written";
          return {
            environment: env.name,
            slug: env.slug,
            state: isWritten ? "success" : "failed",
            // The flat import has always reported approvals only when every batch succeeded
            hasApproval: isWritten && hasApproval,
            problems: [] as string[]
          };
        }

        // Existing folders are looked up first, so a user without folder create permission
        // can still write into them and reused folders are not reported as new work
        const resolveFolder = createFolderResolver({
          listFolderNames: async (parentPath) =>
            (await enqueue(() => fetchProjectFolders(projectId, env.slug, parentPath))).map(
              ({ name }) => name
            ),
          canCreateFolder: (parentPath) => canCreateFolderIn(env.slug, parentPath),
          createFolder: (parentPath, name) =>
            enqueue(() =>
              createFolder({ projectId, environment: env.slug, path: parentPath, name })
            )
        });
        const { state, hasApproval, problems } = await runNestedImport(nestedImport, {
          resolveFolder: (path) => resolveFolder(joinSecretPath(secretPath, path)),
          writeSecrets: (path, secrets) =>
            writeSecrets(env.slug, joinSecretPath(secretPath, path), secrets, enqueue)
        });
        return {
          environment: env.name,
          slug: env.slug,
          state,
          hasApproval,
          problems: problems.map(
            ({ path, reason }) => `${joinSecretPath(secretPath, path)}: ${reason}`
          )
        };
      });

      const envResults = await Promise.allSettled(envPromises);

      const successEnvs: string[] = [];
      const successEnvSlugs: string[] = [];
      const approvalEnvs: string[] = [];
      const approvalEnvSlugs: string[] = [];
      const failedEnvs: string[] = [];
      const partialEnvs: string[] = [];
      const partialEnvSlugs: string[] = [];

      envResults.forEach((result, idx) => {
        if (result.status === "fulfilled" && result.value) {
          const { environment, problems } = result.value;
          const envLabel = problems.length
            ? `${environment} (${problems.join(", ")})`
            : environment;
          if (result.value.state === "partial") {
            partialEnvs.push(envLabel);
            partialEnvSlugs.push(result.value.slug);
            if (result.value.hasApproval) approvalEnvs.push(environment);
          } else if (result.value.state === "failed") {
            failedEnvs.push(envLabel);
            if (result.value.hasApproval) approvalEnvs.push(environment);
          } else if (result.value.hasApproval) {
            approvalEnvs.push(result.value.environment);
            approvalEnvSlugs.push(result.value.slug);
          } else {
            successEnvs.push(result.value.environment);
            successEnvSlugs.push(result.value.slug);
          }
        } else if (result.status === "rejected") {
          failedEnvs.push(selectedEnvs[idx].name);
        }
      });

      if (successEnvs.length) {
        createNotification({
          type: "success",
          text: `Successfully uploaded ${secretCount} secret${secretCount > 1 ? "s" : ""}${folderSummary} into ${successEnvs.join(", ")}`
        });
      }

      if (approvalEnvs.length) {
        createNotification({
          type: "info",
          text: `Change request submitted for ${approvalEnvs.join(", ")}`
        });
      }

      if (partialEnvs.length) {
        createNotification({
          type: "warning",
          text: `Some folders failed to upload: ${partialEnvs.join("; ")}`
        });
      }

      if (failedEnvs.length) {
        createNotification({
          type: "error",
          text: `Failed to upload secrets into ${failedEnvs.join(", ")}`
        });
      }

      onClose();
      const completedEnvSlugs = [...successEnvSlugs, ...approvalEnvSlugs, ...partialEnvSlugs];
      if (completedEnvSlugs.length) {
        onComplete?.(completedEnvSlugs);
      }
    } catch (err) {
      console.error(err);
      createNotification({
        type: "error",
        text: "Failed to upload secrets"
      });
    } finally {
      isImportRunningRef.current = false;
      setNestedProgress(null);
      setIsImporting.off();
    }
  };

  const handleBack = () => {
    setParsedSecrets(null);
    setNestedJson(null);
    setShouldImportNested(false);
    setCollapsedFolders(new Set());
    setVisibleSecretKeys(new Set());
    setKeyOverrides({});
  };

  const toggleSecretVisibility = (key: string) => {
    setVisibleSecretKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const areAllVisible =
    allSecretKeys.length > 0 && allSecretKeys.every((k) => visibleSecretKeys.has(k));

  const toggleAllSecretVisibility = () => {
    if (areAllVisible) {
      setVisibleSecretKeys(new Set());
    } else {
      setVisibleSecretKeys(new Set(allSecretKeys));
    }
  };

  const showUploadStep = !activeSecrets;

  if (csvData) {
    return (
      <CsvColumnMapContent
        headers={csvData.headers}
        matrix={csvData.matrix}
        delimiter={csvData.delimiter}
        onClose={() => setCsvData(null)}
        onParsedSecrets={(env) => {
          setCsvData(null);
          handleParsedSecrets(env);
        }}
      />
    );
  }

  if (showUploadStep) {
    return (
      <>
        <Tabs
          value={importMethod}
          onValueChange={(value) => setImportMethod(value as "upload" | "paste")}
          className="min-h-0 flex-1 gap-0"
        >
          <SheetHeader className="border-0 p-0">
            <SheetTitle className="sr-only">Upload Secrets</SheetTitle>
            <SheetDescription className="sr-only">
              Upload a file or paste secret values, then review them before uploading.
            </SheetDescription>
            <TabsList
              variant="project"
              aria-label="Secret import method"
              className="h-auto min-h-12 px-4 data-[style=underline]:items-end"
            >
              <TabsTrigger value="upload" className="h-9">
                Upload File
              </TabsTrigger>
              <TabsTrigger value="paste" className="h-9">
                Paste Secrets
              </TabsTrigger>
            </TabsList>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <TabsContent value="upload" forceMount className="data-[state=inactive]:hidden">
              <ProjectPermissionCan
                I={ProjectPermissionActions.Create}
                a={subject(ProjectPermissionSub.Secrets, {
                  environment: environments[0]?.slug || "",
                  secretPath,
                  secretName: "*",
                  secretTags: ["*"]
                })}
              >
                {(isAllowed) => (
                  <FileDropzone
                    isDisabled={!isAllowed}
                    accept=".txt,.env,.yml,.yaml,.json,.csv,.pfx,.pem,.crt"
                    description=".env, .json, .yml, .csv, .pfx, .pem, or .crt (1 MB request limit)"
                    onFilesSelect={(files) => parseFile(files[0])}
                  />
                )}
              </ProjectPermissionCan>
            </TabsContent>
            <TabsContent value="paste" forceMount className="data-[state=inactive]:hidden">
              <PasteSecretsContent
                onParsedSecrets={handleParsedSecrets}
                onDirtyChange={setIsPasteDirty}
              />
            </TabsContent>
          </div>
        </Tabs>
        <SheetFooter className="border-t">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {importMethod === "paste" && (
            <Button
              variant="project"
              type="submit"
              form={PASTE_SECRETS_FORM_ID}
              className="ml-auto"
              isDisabled={!isPasteDirty}
            >
              Parse Secrets
            </Button>
          )}
        </SheetFooter>
      </>
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Review & Upload Secrets</SheetTitle>
        <SheetDescription>
          {secretCount} secret{secretCount !== 1 ? "s" : ""} found
          {folderSummary}. Select environments to upload to.
        </SheetDescription>
        {isOverRequestLimit && (
          <p className="text-sm text-danger">
            These secrets exceed the 1 MB upload limit. Split them into smaller uploads.
          </p>
        )}
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {hasNestedErrors && (
            <Alert variant="danger">
              <CircleXIcon />
              <AlertTitle>Some keys cannot be imported</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {nestedImport!.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <div className="relative flex flex-col gap-2">
            <Table
              className="w-full table-fixed border-collapse"
              containerClassName="max-h-[60vh] overflow-y-auto overflow-x-hidden"
            >
              <TableHeader className="sticky top-0 z-[1] after:pointer-events-none after:absolute after:inset-x-0 after:-top-px after:h-px after:bg-container">
                <TableRow className="relative h-9">
                  <TableHead className="w-1/2 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                    {folderTree && folderTree.children.length > 0 ? (
                      <button
                        type="button"
                        className="flex cursor-pointer items-center gap-1 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4"
                        aria-label={
                          areAllFoldersCollapsed
                            ? "Key: expand all folders"
                            : "Key: collapse all folders"
                        }
                        aria-expanded={!areAllFoldersCollapsed}
                        title={
                          areAllFoldersCollapsed ? "Expand all folders" : "Collapse all folders"
                        }
                        onClick={toggleAllFolders}
                      >
                        Key
                        {areAllFoldersCollapsed ? <ChevronsUpDownIcon /> : <ChevronsDownUpIcon />}
                      </button>
                    ) : (
                      "Key"
                    )}
                  </TableHead>
                  <TableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                    Value
                  </TableHead>
                  <TableHead className="w-24 bg-container text-right shadow-[inset_0_-1px_0_var(--color-border)]">
                    <IconButton
                      aria-label={
                        areAllVisible ? "Hide all secret values" : "Reveal all secret values"
                      }
                      variant="ghost"
                      size="xs"
                      onClick={toggleAllSecretVisibility}
                    >
                      {areAllVisible ? <EyeOffIcon /> : <EyeIcon />}
                    </IconButton>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableVirtualBody count={reviewRows.length}>
                {(index, rowProps) => {
                  const row = reviewRows[index];
                  if (row.type === "folder") {
                    const { node } = row;
                    const isExpanded = !collapsedFolders.has(node.path);
                    return (
                      <TableRow key={row.id} className="group/folder" {...rowProps}>
                        <TableCell isTruncatable className="w-1/2">
                          <ImportKeyContent depth={row.depth}>
                            <button
                              type="button"
                              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
                              aria-expanded={isExpanded}
                              onClick={() => toggleFolder(node.path)}
                              className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-xs text-left font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {isExpanded ? (
                                <FolderOpenIcon
                                  className="size-4 shrink-0 text-folder"
                                  aria-hidden
                                />
                              ) : (
                                <>
                                  <FolderIcon
                                    className="size-4 shrink-0 text-folder group-focus-within/folder:hidden group-hover/folder:hidden"
                                    aria-hidden
                                  />
                                  <ChevronRightIcon className="hidden size-4 shrink-0 text-muted group-focus-within/folder:block group-hover/folder:block" />
                                </>
                              )}
                              <span className="truncate">{node.name}</span>
                            </button>
                          </ImportKeyContent>
                        </TableCell>
                        <TableCell isTruncatable className="w-1/2 font-mono text-muted">
                          {joinSecretPath(secretPath, node.path)}
                        </TableCell>
                        <TableCell className="w-24 text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="rounded-xs text-xs whitespace-nowrap text-muted focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {node.secretCount} secret{node.secretCount !== 1 ? "s" : ""}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {node.secretCount} secret{node.secretCount !== 1 ? "s" : ""},
                              including subfolders
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const { id, key, secretData } = row;
                  const isVisible = visibleSecretKeys.has(id);
                  const hasComments = secretData.comments.some((c) => c);
                  const hasTags = Boolean(secretData.tagSlugs?.length);
                  const hasMetadata = Boolean(secretData.secretMetadata?.length);
                  const hasSkipMl = secretData.skipMultilineEncoding === true;
                  const editableKey = secretData.isFileSecret === true;
                  const editedKey = keyOverrides[key] ?? key;
                  return (
                    <TableRow key={id} {...rowProps}>
                      <TableCell isTruncatable className="w-1/2 overflow-hidden font-mono text-xs">
                        <ImportKeyContent depth={folderTree ? row.depth : undefined}>
                          <KeyRoundIcon className="size-4 shrink-0 text-secret" aria-hidden />
                          {editableKey ? (
                            <Input
                              value={editedKey}
                              onChange={(e) =>
                                setKeyOverrides((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              isError={!editedKey.trim()}
                              placeholder="Secret key"
                              className="h-7 font-mono text-xs"
                            />
                          ) : (
                            <p className="truncate">{key}</p>
                          )}
                          {hasComments && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <MessageSquareIcon className="size-3.5 shrink-0 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xl whitespace-pre-wrap">
                                  {secretData.comments.join("\n")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {hasTags && (
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <span className="flex size-5 shrink-0 items-center justify-center text-muted">
                                  <TagsIcon className="size-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xl">
                                <div className="flex flex-col gap-1">
                                  {secretData.tagSlugs!.map((slug) => (
                                    <span key={slug} className="font-mono text-xs break-all">
                                      {slug}
                                    </span>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {hasMetadata && (
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <span className="flex size-5 shrink-0 items-center justify-center text-muted">
                                  <CodeXmlIcon className="size-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xl">
                                <div className="flex flex-col gap-1">
                                  {secretData.secretMetadata!.map((m) => (
                                    <span key={m.key} className="font-mono text-xs break-all">
                                      {m.key}={m.value}
                                    </span>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {hasSkipMl && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex size-5 shrink-0 items-center justify-center text-muted">
                                  <WrapTextIcon className="size-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Multi-line encoding enabled</TooltipContent>
                            </Tooltip>
                          )}
                        </ImportKeyContent>
                      </TableCell>
                      <TableCell isTruncatable className="w-1/2 font-mono text-xs whitespace-pre">
                        {isVisible ? (
                          secretData.value || <span className="text-muted">EMPTY</span>
                        ) : (
                          <span className="tracking-widest">••••••••••••••••••••••</span>
                        )}
                      </TableCell>
                      <TableCell className="w-24 text-right">
                        <IconButton
                          aria-label={`${isVisible ? "Hide" : "Reveal"} ${key}`}
                          variant="ghost"
                          size="xs"
                          onClick={() => toggleSecretVisibility(id)}
                        >
                          {isVisible ? <EyeOffIcon /> : <EyeIcon />}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableVirtualBody>
            </Table>
          </div>
          <Field>
            <FieldLabel htmlFor="target-environments">
              Target Environments
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                </TooltipTrigger>
                <TooltipContent>The environments the secrets should be added to</TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Combobox<{ name: string; slug: string }>
                id="target-environments"
                multiple
                singleLine
                options={allowedEnvironments}
                value={selectedEnvs}
                onValueChange={setSelectedEnvs}
                onClear={() => setSelectedEnvs([])}
                placeholder="Select environments to upload to..."
                searchPlaceholder="Search environments..."
                searchAriaLabel="Search target environments"
                clearAriaLabel="Clear target environments"
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.slug}
              />
            </FieldContent>
          </Field>
          <Field orientation="horizontal" className="w-fit">
            <FieldLabel>
              Overwrite Existing Secrets
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                </TooltipTrigger>
                <TooltipContent className="max-w-md text-center">
                  When enabled, secrets that already exist in the target environment will be updated
                  with the imported values. When disabled, existing secrets will be skipped and only
                  new secrets will be created.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Toggle
              variant="danger"
              checked={shouldOverwrite}
              onCheckedChange={setShouldOverwrite}
            />
          </Field>
          {nestedJson && (
            <Field orientation="horizontal" className="w-fit">
              <FieldLabel htmlFor="import-nested-as-folders">
                Import Nested Objects as Folders
                <Tooltip>
                  <TooltipTrigger>
                    <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md text-center">
                    Each nested object becomes a folder relative to {secretPath}, and its values
                    become secrets in that folder. Arrays are stored as JSON strings, null as an
                    empty value, and numbers and booleans as text.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Toggle
                id="import-nested-as-folders"
                checked={shouldImportNested}
                onCheckedChange={setShouldImportNested}
              />
            </Field>
          )}
        </div>
      </div>

      <SheetFooter className="border-t">
        {!initialParsedSecrets && (
          <Button
            variant="outline"
            onClick={handleBack}
            className="mr-auto"
            isDisabled={isNestedUploadRunning}
          >
            Back
          </Button>
        )}
        {isNestedUploadRunning && nestedProgress && (
          <p className="self-center text-xs text-muted" aria-live="polite">
            {nestedProgress.waitMs
              ? "Rate limit reached, resuming shortly…"
              : `Sent ${nestedProgress.completed} of ${nestedProgress.queued} requests…`}
          </p>
        )}
        <Button variant="ghost" onClick={onClose} isDisabled={isNestedUploadRunning}>
          Cancel
        </Button>
        <Button
          variant="project"
          onClick={handleImport}
          isDisabled={
            !selectedEnvs.length ||
            isImporting ||
            isWaitingForTags ||
            hasInvalidKey ||
            isOverRequestLimit ||
            hasNestedErrors
          }
          isPending={isImporting || isWaitingForTags}
        >
          Upload {secretCount} Secret{secretCount !== 1 ? "s" : ""}
        </Button>
      </SheetFooter>
    </>
  );
};

export const ImportSecretsSheet = ({
  isOpen,
  onOpenChange,
  environments,
  projectId,
  secretPath,
  initialParsedSecrets,
  initialFile,
  initialStep,
  initialSelectedEnvironments,
  onComplete
}: Props) => {
  const [isLocked, setIsLocked] = useState(false);
  // Covers the close button, Escape and outside clicks while a nested upload is running
  const handleOpenChange = (open: boolean) => {
    if (!open && isLocked) return;
    onOpenChange(open);
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-3xl">
        <ImportSecretsContent
          environments={environments}
          projectId={projectId}
          secretPath={secretPath}
          initialParsedSecrets={initialParsedSecrets}
          initialFile={initialFile}
          initialStep={initialStep}
          initialSelectedEnvironments={initialSelectedEnvironments}
          onComplete={onComplete}
          onClose={() => onOpenChange(false)}
          onLockChange={setIsLocked}
        />
      </SheetContent>
    </Sheet>
  );
};
