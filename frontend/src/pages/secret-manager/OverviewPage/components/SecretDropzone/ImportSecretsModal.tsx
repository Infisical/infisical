import { useCallback, useEffect, useMemo, useState } from "react";
import { subject } from "@casl/ability";
import {
  CircleXIcon,
  CodeXmlIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  InfoIcon,
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
import { useCreateSecretBatch, useGetOrCreateFolder, useUpdateSecretBatch } from "@app/hooks/api";
import { fetchProjectSecrets, mergePersonalSecrets } from "@app/hooks/api/secrets/queries";
import { useCreateWsTag, useGetWsTags } from "@app/hooks/api/tags/queries";
import { SecretType } from "@app/hooks/api/types";

import { CsvColumnMapContent } from "./CsvColumnMapDialog";
import { flattenNestedJson, getNestedJsonObject, joinSecretPath } from "./parseNestedJson";
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
  | { type: "folder"; id: string; path: string }
  | { type: "secret"; id: string; key: string; secretData: TParsedEnv[string] };

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
  onClose
}: ContentProps) => {
  const { permission } = useProjectPermission();
  const [parsedSecrets, setParsedSecrets] = useState<TParsedEnv | null>(null);
  const [isImporting, setIsImporting] = useToggle();
  const [importMethod, setImportMethod] = useState<"upload" | "paste">(initialStep);
  const [isPasteDirty, setIsPasteDirty] = useState(false);
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [visibleSecretKeys, setVisibleSecretKeys] = useState<Set<string>>(new Set());
  const [shouldOverwrite, setShouldOverwrite] = useState(false);
  const [keyOverrides, setKeyOverrides] = useState<Record<string, string>>({});
  const [nestedJson, setNestedJson] = useState<Record<string, unknown> | null>(null);
  const [shouldImportNested, setShouldImportNested] = useState(false);

  const { mutateAsync: createSecretBatch } = useCreateSecretBatch();
  const { mutateAsync: updateSecretBatch } = useUpdateSecretBatch();
  const { mutateAsync: getOrCreateFolder } = useGetOrCreateFolder();
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

  // Nested row ids are "<path>:<key>", which cannot collide because folder names and
  // nested secret keys never contain ":"
  const reviewRows = useMemo<TReviewRow[]>(() => {
    const toSecretRows = (secrets: TParsedEnv = {}, path?: string) =>
      Object.entries(secrets).map(([key, secretData]) => ({
        type: "secret" as const,
        id: path ? `${path}:${key}` : key,
        key,
        secretData
      }));
    if (!nestedImport) return toSecretRows(activeSecrets ?? undefined);
    const { folderPaths, secretsByPath } = nestedImport;
    return [
      ...toSecretRows(secretsByPath["/"]),
      ...folderPaths.flatMap((path) => [
        { type: "folder" as const, id: path, path },
        ...toSecretRows(secretsByPath[path], path)
      ])
    ];
  }, [nestedImport, activeSecrets]);

  const allSecretKeys = reviewRows.filter((row) => row.type === "secret").map((row) => row.id);
  const secretCount = allSecretKeys.length;
  const folderCount = nestedImport?.folderPaths.length ?? 0;
  const folderSummary = nestedImport
    ? ` across ${folderCount} folder${folderCount !== 1 ? "s" : ""}`
    : "";
  const hasNestedErrors = Boolean(nestedImport?.errors.length);
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
    if (!activeSecrets) return false;
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
  }, [activeSecrets, keyOverrides, projectId, secretPath, selectedEnvs]);

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

      const ensureFolder = async (environment: string, path: string) => {
        if (path === "/") return;
        const pathSegment = path.split("/").filter(Boolean);
        const parentPath = `/${pathSegment.slice(0, -1).join("/")}`;
        const folderName = pathSegment.at(-1);
        const canCreateFolder = permission.can(
          ProjectPermissionActions.Create,
          subject(ProjectPermissionSub.SecretFolders, {
            environment,
            secretPath: parentPath
          })
        );

        if (folderName && parentPath && canCreateFolder) {
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
        secrets: TParsedEnv
      ) => {
        // Fetch existing secrets to detect conflicts
        const { secrets: rawExisting } = await fetchProjectSecrets({
          projectId,
          environment,
          secretPath: path,
          viewSecretValue: false
        });

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

        return Promise.allSettled([
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
        ]);
      };

      const envPromises = selectedEnvs.map(async (env) => {
        await ensureFolder(env.slug, secretPath);

        let results: PromiseSettledResult<unknown>[];
        let failedPaths: string[] = [];
        let pathCount = 1;
        if (nestedImport) {
          // Folders are created one at a time so parents always exist before their children
          // eslint-disable-next-line no-restricted-syntax
          for (const folderPath of nestedImport.folderPaths) {
            // eslint-disable-next-line no-await-in-loop
            await ensureFolder(env.slug, joinSecretPath(secretPath, folderPath));
          }
          const pathEntries = Object.entries(nestedImport.secretsByPath).map(
            ([path, secrets]) => [joinSecretPath(secretPath, path), secrets] as const
          );
          const pathResults = await Promise.allSettled(
            pathEntries.map(([path, secrets]) => importSecretsAtPath(env.slug, path, secrets))
          );
          results = pathResults.flatMap((r) => (r.status === "fulfilled" ? r.value : [r]));
          failedPaths = pathEntries
            .filter((_, idx) => {
              const r = pathResults[idx];
              return r.status === "rejected" || r.value.some((v) => v.status === "rejected");
            })
            .map(([path]) => path);
          pathCount = pathEntries.length;
        } else {
          results = await importSecretsAtPath(env.slug, secretPath, activeSecrets);
        }
        const hasApproval = results.some(
          (r) => r.status === "fulfilled" && "approval" in (r.value as object)
        );
        const failCount = results.filter((r) => r.status === "rejected").length;

        return {
          environment: env.name,
          slug: env.slug,
          hasApproval,
          failCount,
          failedPaths,
          isPartial: failedPaths.length > 0 && failedPaths.length < pathCount
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
          if (result.value.isPartial) {
            partialEnvs.push(
              `${result.value.environment} (${result.value.failedPaths.join(", ")})`
            );
            partialEnvSlugs.push(result.value.slug);
            if (result.value.hasApproval) approvalEnvs.push(result.value.environment);
          } else if (result.value.failCount > 0) {
            failedEnvs.push(result.value.environment);
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
      setIsImporting.off();
    }
  };

  const handleBack = () => {
    setParsedSecrets(null);
    setNestedJson(null);
    setShouldImportNested(false);
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
              className="border-collapse"
              containerClassName="max-h-[60vh] overflow-y-auto overflow-x-hidden"
            >
              <TableHeader className="sticky top-0 z-[1] after:pointer-events-none after:absolute after:inset-x-0 after:-top-px after:h-px after:bg-container">
                <TableRow className="relative h-9">
                  <TableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                    Key
                  </TableHead>
                  <TableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                    Value
                  </TableHead>
                  <TableHead className="w-10 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                    <IconButton variant="ghost" size="xs" onClick={toggleAllSecretVisibility}>
                      {areAllVisible ? <EyeOffIcon /> : <EyeIcon />}
                    </IconButton>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewRows.map((row) => {
                  if (row.type === "folder") {
                    return (
                      <TableRow key={row.id} className="bg-container">
                        <TableCell colSpan={3} isTruncatable className="font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            <FolderIcon className="size-3.5 shrink-0 text-folder" />
                            <p className="truncate">{row.path}</p>
                          </div>
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
                    <TableRow key={id}>
                      <TableCell isTruncatable className="w-1/2 overflow-hidden font-mono text-xs">
                        <div className="flex w-full items-center gap-1.5">
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
                        </div>
                      </TableCell>
                      <TableCell isTruncatable className="w-1/2 font-mono text-xs whitespace-pre">
                        {isVisible ? (
                          secretData.value || <span className="text-muted">EMPTY</span>
                        ) : (
                          <span className="tracking-widest">••••••••••••••••••••••</span>
                        )}
                      </TableCell>
                      <TableCell className="w-10">
                        <IconButton
                          variant="ghost"
                          size="xs"
                          onClick={() => toggleSecretVisibility(id)}
                        >
                          {isVisible ? <EyeOffIcon /> : <EyeIcon />}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
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
          <Button variant="outline" onClick={handleBack} className="mr-auto">
            Back
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
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
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
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
        />
      </SheetContent>
    </Sheet>
  );
};
