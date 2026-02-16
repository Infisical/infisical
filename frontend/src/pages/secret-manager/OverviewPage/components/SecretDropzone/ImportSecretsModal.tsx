import { ChangeEvent, DragEvent, useCallback, useState } from "react";
import { subject } from "@casl/ability";
import {
  ClipboardPasteIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  MessageSquareIcon,
  UploadIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  parseCsvToMatrix,
  parseDotEnv,
  parseJson,
  parseYaml
} from "@app/components/utilities/parseSecrets";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyMedia,
  Field,
  FieldContent,
  FieldLabel,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { useCreateSecretBatch, useGetOrCreateFolder, useUpdateSecretBatch } from "@app/hooks/api";
import { fetchProjectSecrets, mergePersonalSecrets } from "@app/hooks/api/secrets/queries";
import { SecretType } from "@app/hooks/api/types";

import { CsvColumnMapDialog } from "./CsvColumnMapDialog";
import { PasteSecretsDialog } from "./PasteSecretsDialog";

type TParsedEnv = Record<string, { value: string; comments: string[] }>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  environments: { name: string; slug: string }[];
  projectId: string;
  secretPath: string;
  initialParsedSecrets?: TParsedEnv | null;
  onComplete?: () => void;
};

type ContentProps = {
  environments: { name: string; slug: string }[];
  projectId: string;
  secretPath: string;
  initialParsedSecrets?: TParsedEnv | null;
  onComplete?: () => void;
  onClose: () => void;
};

const ImportSecretsContent = ({
  environments,
  projectId,
  secretPath,
  initialParsedSecrets,
  onComplete,
  onClose
}: ContentProps) => {
  const { permission } = useProjectPermission();
  const [parsedSecrets, setParsedSecrets] = useState<TParsedEnv | null>(null);
  const [selectedEnvs, setSelectedEnvs] = useState<{ name: string; slug: string }[]>([]);
  const [isDragActive, setDragActive] = useToggle();
  const [isImporting, setIsImporting] = useToggle();
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [csvData, setCsvData] = useState<{ headers: string[]; matrix: string[][] } | null>(null);
  const [visibleSecretKeys, setVisibleSecretKeys] = useState<Set<string>>(new Set());
  const [shouldOverwrite, setShouldOverwrite] = useState(false);

  const { mutateAsync: createSecretBatch } = useCreateSecretBatch();
  const { mutateAsync: updateSecretBatch } = useUpdateSecretBatch();
  const { mutateAsync: getOrCreateFolder } = useGetOrCreateFolder();

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

  const activeSecrets = initialParsedSecrets || parsedSecrets;
  const secretCount = activeSecrets ? Object.keys(activeSecrets).length : 0;

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

      const reader = new FileReader();
      reader.onload = (event) => {
        if (!event?.target?.result) {
          createNotification({
            type: "error",
            text: "Invalid file contents."
          });
          return;
        }

        const src = event.target.result as ArrayBuffer;

        switch (file.type) {
          case "application/json":
            handleParsedSecrets(parseJson(src));
            break;
          case "text/yaml":
          case "application/x-yaml":
          case "application/yaml":
            handleParsedSecrets(parseYaml(src));
            break;
          case "text/csv": {
            const fullMatrix = parseCsvToMatrix(src);
            if (!fullMatrix.length) {
              createNotification({
                type: "error",
                text: "Failed to find secrets in CSV file. File might be empty."
              });
              return;
            }
            setCsvData({ headers: fullMatrix[0], matrix: fullMatrix.slice(1) });
            return;
          }
          default:
            handleParsedSecrets(parseDotEnv(src));
            break;
        }
      };

      try {
        reader.readAsText(file);
      } catch (error) {
        console.log(error);
      }
    },
    [handleParsedSecrets]
  );

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive.on();
    } else if (e.type === "dragleave") {
      setDragActive.off();
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer) return;
    e.dataTransfer.dropEffect = "copy";
    setDragActive.off();
    parseFile(e.dataTransfer.files[0]);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    parseFile(e.target?.files?.[0]);
  };

  const handleImport = async () => {
    if (!activeSecrets || !selectedEnvs.length) return;

    setIsImporting.on();

    try {
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

        // Split secrets into creates vs updates
        const secretsToCreate = Object.entries(activeSecrets)
          .filter(([key]) => !existingMap[key])
          .map(([secretKey, secretData]) => ({
            secretKey,
            secretValue: secretData.value,
            secretComment: secretData.comments.join("\n") || "",
            type: SecretType.Shared
          }));

        const secretsToUpdate = Object.entries(activeSecrets)
          .filter(([key]) => existingMap[key])
          .map(([secretKey, secretData]) => ({
            secretKey,
            secretValue: secretData.value,
            secretComment: secretData.comments.join("\n") || undefined,
            type: SecretType.Shared
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
      const approvalEnvs: string[] = [];
      const failedEnvs: string[] = [];

      envResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          if (result.value.failCount > 0) {
            failedEnvs.push(result.value.environment);
          } else if (result.value.hasApproval) {
            approvalEnvs.push(result.value.environment);
          } else {
            successEnvs.push(result.value.environment);
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
      onComplete?.();
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

  return (
    <>
      <DialogHeader>
        <DialogTitle>{showUploadStep ? "Upload Secrets" : "Review & Upload Secrets"}</DialogTitle>
        <DialogDescription>
          {showUploadStep
            ? "Upload a file or paste secrets to upload them across environments"
            : `${secretCount} secret${secretCount !== 1 ? "s" : ""} found. Select environments to upload to.`}
        </DialogDescription>
      </DialogHeader>

      {showUploadStep ? (
        <div className="flex flex-col gap-4">
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
              <UnstableEmpty
                className={twMerge(
                  "relative cursor-pointer border transition-colors duration-75",
                  isDragActive && "bg-container-hover"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <UnstableEmptyHeader>
                  <EmptyMedia variant="icon">
                    <UploadIcon />
                  </EmptyMedia>
                  <UnstableEmptyTitle>
                    {isDragActive ? "Drop your file here" : "Upload your secrets"}
                  </UnstableEmptyTitle>
                  <UnstableEmptyDescription>
                    Drag and drop your .env, .json, .yml, or .csv files here, or click to browse
                  </UnstableEmptyDescription>
                </UnstableEmptyHeader>
                <input
                  type="file"
                  disabled={!isAllowed}
                  className="absolute top-0 left-0 h-full w-full cursor-pointer opacity-0"
                  accept=".txt,.env,.yml,.yaml,.json,.csv"
                  onChange={handleFileUpload}
                />
              </UnstableEmpty>
            )}
          </ProjectPermissionCan>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-muted/50" />
            <span className="text-xs text-muted/50">OR</span>
            <div className="flex-1 border-t border-muted/50" />
          </div>

          <Button variant="outline" className="w-full" onClick={() => setIsPasteOpen(true)}>
            <ClipboardPasteIcon className="mr-2 size-4" />
            Paste Secrets
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative flex flex-col gap-2">
            <UnstableTable
              className="border-collapse"
              containerClassName="max-h-[60vh] overflow-y-auto overflow-x-hidden"
            >
              <UnstableTableHeader className="sticky top-0 z-[1] after:pointer-events-none after:absolute after:inset-x-0 after:-top-px after:h-px after:bg-container">
                <UnstableTableRow className="relative h-9">
                  <UnstableTableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                    Key
                  </UnstableTableHead>
                  <UnstableTableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                    Value
                  </UnstableTableHead>
                  <UnstableTableHead className="w-10 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                    <UnstableIconButton
                      variant="ghost"
                      size="xs"
                      onClick={toggleAllSecretVisibility}
                    >
                      {areAllVisible ? <EyeOffIcon /> : <EyeIcon />}
                    </UnstableIconButton>
                  </UnstableTableHead>
                </UnstableTableRow>
              </UnstableTableHeader>
              <UnstableTableBody>
                {Object.entries(activeSecrets!).map(([key, secretData]) => {
                  const isVisible = visibleSecretKeys.has(key);
                  const hasComments = secretData.comments.length > 0;
                  return (
                    <UnstableTableRow key={key}>
                      <UnstableTableCell
                        isTruncatable
                        className="w-1/2 overflow-hidden font-mono text-xs"
                      >
                        <div className="flex w-full items-center gap-1.5">
                          <p className="truncate">{key}</p>
                          {hasComments && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <MessageSquareIcon className="size-3.5 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs whitespace-pre-wrap">
                                  {secretData.comments.join("\n")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </UnstableTableCell>
                      <UnstableTableCell isTruncatable className="w-1/2 font-mono text-xs">
                        {isVisible ? (
                          secretData.value || <span className="text-muted">EMPTY</span>
                        ) : (
                          <span className="tracking-widest">••••••••••••••••••••••</span>
                        )}
                      </UnstableTableCell>
                      <UnstableTableCell className="w-10">
                        <UnstableIconButton
                          variant="ghost"
                          size="xs"
                          onClick={() => toggleSecretVisibility(key)}
                        >
                          {isVisible ? <EyeOffIcon /> : <EyeIcon />}
                        </UnstableIconButton>
                      </UnstableTableCell>
                    </UnstableTableRow>
                  );
                })}
              </UnstableTableBody>
            </UnstableTable>
          </div>
          <Field>
            <FieldLabel>
              Target Environments
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                </TooltipTrigger>
                <TooltipContent>The environments the secrets should be added to</TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isMulti
                menuPlacement="top"
                options={allowedEnvironments}
                value={selectedEnvs}
                onChange={(val) => setSelectedEnvs(val as { name: string; slug: string }[])}
                placeholder="Select environments to upload to..."
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
              checked={shouldOverwrite}
              variant="danger"
              onCheckedChange={setShouldOverwrite}
            />
          </Field>
        </div>
      )}

      <DialogFooter>
        {!showUploadStep && !initialParsedSecrets && (
          <Button variant="ghost" onClick={handleBack} className="mr-auto">
            Back
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {!showUploadStep && (
          <Button
            variant="project"
            onClick={handleImport}
            isDisabled={!selectedEnvs.length || isImporting}
            isPending={isImporting}
          >
            Upload {secretCount} Secret{secretCount !== 1 ? "s" : ""}
          </Button>
        )}
      </DialogFooter>

      <PasteSecretsDialog
        isOpen={isPasteOpen}
        onOpenChange={setIsPasteOpen}
        onParsedSecrets={handleParsedSecrets}
      />

      {csvData && (
        <CsvColumnMapDialog
          isOpen={Boolean(csvData)}
          onOpenChange={(open) => {
            if (!open) setCsvData(null);
          }}
          headers={csvData.headers}
          matrix={csvData.matrix}
          onParsedSecrets={(env) => {
            setCsvData(null);
            handleParsedSecrets(env);
          }}
        />
      )}
    </>
  );
};

export const ImportSecretsModal = ({
  isOpen,
  onOpenChange,
  environments,
  projectId,
  secretPath,
  initialParsedSecrets,
  onComplete
}: Props) => {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
        else onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-2xl">
        <ImportSecretsContent
          environments={environments}
          projectId={projectId}
          secretPath={secretPath}
          initialParsedSecrets={initialParsedSecrets}
          onComplete={onComplete}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
