import { useCallback, useEffect, useState } from "react";
import { subject } from "@casl/ability";
import {
  CodeXmlIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  MessageSquareIcon,
  TagsIcon,
  WrapTextIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
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
  Switch,
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
import { CsvData, parseSecretFile } from "./parseSecretFile";
import { PASTE_SECRETS_FORM_ID, PasteSecretsContent } from "./PasteSecretsDialog";
import { TParsedEnv } from "./types";

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
  const secretCount = activeSecrets ? Object.keys(activeSecrets).length : 0;
  const hasTagsToResolve = activeSecrets
    ? Object.values(activeSecrets).some((s) => s.tagSlugs?.length)
    : false;
  const isWaitingForTags = canReadTags && hasTagsToResolve && isTagsLoading;
  const hasInvalidKey = activeSecrets
    ? Object.entries(activeSecrets).some(
        ([key, s]) => s.isFileSecret && !(keyOverrides[key] ?? key).trim()
      )
    : false;

  const handleParsedSecrets = useCallback((env: TParsedEnv) => {
    if (!Object.keys(env).length) {
      createNotification({
        type: "error",
        text: "No secrets found in the provided data."
      });
      return;
    }
    setParsedSecrets(env);
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

      const envPromises = selectedEnvs.map(async (env) => {
        // Ensure folder exists if not root
        if (secretPath !== "/") {
          const pathSegment = secretPath.split("/").filter(Boolean);
          const parentPath = `/${pathSegment.slice(0, -1).join("/")}`;
          const folderName = pathSegment.at(-1);
          const canCreateFolder = permission.can(
            ProjectPermissionActions.Create,
            subject(ProjectPermissionSub.SecretFolders, {
              environment: env.slug,
              secretPath: parentPath
            })
          );

          if (folderName && parentPath && canCreateFolder) {
            await getOrCreateFolder({
              projectId,
              path: parentPath,
              environment: env.slug,
              name: folderName
            });
          }
        }

        // Fetch existing secrets to detect conflicts
        const { secrets: rawExisting } = await fetchProjectSecrets({
          projectId,
          environment: env.slug,
          secretPath,
          viewSecretValue: false
        });

        const existingSecrets = mergePersonalSecrets(rawExisting);
        const existingMap = existingSecrets.reduce<Record<string, boolean>>(
          (acc, s) => ({ ...acc, [s.key]: true }),
          {}
        );

        // Resolve edited keys (file-based secrets can be renamed in the review table)
        const resolvedEntries = Object.entries(activeSecrets).map(([origKey, secretData]) => ({
          finalKey: (keyOverrides[origKey] ?? origKey).trim(),
          secretData
        }));

        // Split secrets into creates vs updates
        const secretsToCreate = resolvedEntries
          .filter(({ finalKey }) => !existingMap[finalKey])
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
          .filter(({ finalKey }) => existingMap[finalKey])
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

        const results = await Promise.allSettled([
          ...(secretsToCreate.length
            ? [
                createSecretBatch({
                  projectId,
                  environment: env.slug,
                  secretPath,
                  secrets: secretsToCreate
                })
              ]
            : []),
          ...(shouldOverwrite && secretsToUpdate.length
            ? [
                updateSecretBatch({
                  projectId,
                  environment: env.slug,
                  secretPath,
                  secrets: secretsToUpdate
                })
              ]
            : [])
        ]);
        const hasApproval = results.some(
          (r) => r.status === "fulfilled" && "approval" in (r.value as object)
        );
        const failCount = results.filter((r) => r.status === "rejected").length;

        return { environment: env.name, slug: env.slug, hasApproval, failCount };
      });

      const envResults = await Promise.allSettled(envPromises);

      const successEnvs: string[] = [];
      const successEnvSlugs: string[] = [];
      const approvalEnvs: string[] = [];
      const approvalEnvSlugs: string[] = [];
      const failedEnvs: string[] = [];

      envResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          if (result.value.failCount > 0) {
            failedEnvs.push(result.value.environment);
          } else if (result.value.hasApproval) {
            approvalEnvs.push(result.value.environment);
            approvalEnvSlugs.push(result.value.slug);
          } else {
            successEnvs.push(result.value.environment);
            successEnvSlugs.push(result.value.slug);
          }
        } else if (result.status === "rejected") {
          failedEnvs.push("unknown");
        }
      });

      if (successEnvs.length) {
        createNotification({
          type: "success",
          text: `Successfully uploaded ${secretCount} secret${secretCount > 1 ? "s" : ""} into ${successEnvs.join(", ")}`
        });
      }

      if (approvalEnvs.length) {
        createNotification({
          type: "info",
          text: `Change request submitted for ${approvalEnvs.join(", ")}`
        });
      }

      if (failedEnvs.length) {
        createNotification({
          type: "error",
          text: `Failed to upload secrets into ${failedEnvs.join(", ")}`
        });
      }

      onClose();
      const completedEnvSlugs = [...successEnvSlugs, ...approvalEnvSlugs];
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

  const allSecretKeys = activeSecrets ? Object.keys(activeSecrets) : [];
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
                    description=".env, .json, .yml, .csv, .pfx, .pem, or .crt"
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
          {secretCount} secret{secretCount !== 1 ? "s" : ""} found. Select environments to upload
          to.
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
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
                {Object.entries(activeSecrets!).map(([key, secretData]) => {
                  const isVisible = visibleSecretKeys.has(key);
                  const hasComments = secretData.comments.some((c) => c);
                  const hasTags = Boolean(secretData.tagSlugs?.length);
                  const hasMetadata = Boolean(secretData.secretMetadata?.length);
                  const hasSkipMl = secretData.skipMultilineEncoding === true;
                  const editableKey = secretData.isFileSecret === true;
                  const editedKey = keyOverrides[key] ?? key;
                  return (
                    <TableRow key={key}>
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
                      <TableCell isTruncatable className="w-1/2 font-mono text-xs">
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
                          onClick={() => toggleSecretVisibility(key)}
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
            <Switch
              variant="danger"
              checked={shouldOverwrite}
              onCheckedChange={setShouldOverwrite}
            />
          </Field>
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
          isDisabled={!selectedEnvs.length || isImporting || isWaitingForTags || hasInvalidKey}
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
