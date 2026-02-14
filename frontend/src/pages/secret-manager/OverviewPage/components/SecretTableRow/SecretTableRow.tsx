import { useEffect, useState } from "react";
import { subject } from "@casl/ability";
import {
  ChevronDownIcon,
  ClipboardCheckIcon,
  CopyIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  GitBranchIcon,
  ImportIcon,
  KeyIcon,
  RefreshCcwIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Modal, ModalContent } from "@app/components/v2";
import {
  Button,
  Checkbox,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { useUpdateSecretV3 } from "@app/hooks/api";
import { SecretType, SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { ProjectEnv } from "@app/hooks/api/types";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import { EnvironmentStatus, ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";
import { SecretEditTableRow } from "./SecretEditTableRow";
import { SecretOverrideRow } from "./SecretOverrideRow";
import SecretRenameForm from "./SecretRenameForm";

type Props = {
  secretKey: string;
  secretPath: string;
  environments: { name: string; slug: string }[];
  isSelected: boolean;
  onToggleSecretSelect: (key: string) => void;
  getSecretByKey: (slug: string, key: string) => SecretV3RawSanitized | undefined;
  onSecretCreate: (env: string, key: string, value: string, type?: SecretType) => Promise<void>;
  onSecretUpdate: (
    env: string,
    key: string,
    value: string | undefined,
    secretValueHidden: boolean,
    type?: SecretType,
    secretId?: string,
    newSecretName?: string
  ) => Promise<void>;
  onSecretDelete: (env: string, key: string, secretId?: string, type?: SecretType) => Promise<void>;
  isImportedSecretPresentInEnv: (env: string, secretName: string) => boolean;
  getImportedSecretByKey: (
    env: string,
    secretName: string
  ) =>
    | {
        secret?: SecretV3RawSanitized;
        secretPath: string;
        environment: string;
        environmentInfo?: ProjectEnv;
      }
    | undefined;
  tableWidth: number;
  importedBy?: {
    environment: { name: string; slug: string };
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string; referencedSecretEnv: string }[];
      isImported: boolean;
    }[];
  }[];
};

export const SecretTableRow = ({
  secretKey,
  environments = [],
  secretPath,
  getSecretByKey,
  onSecretUpdate,
  onSecretCreate,
  onSecretDelete,
  isImportedSecretPresentInEnv,
  getImportedSecretByKey,
  tableWidth,
  onToggleSecretSelect,
  isSelected,
  importedBy
}: Props) => {
  const [isFormExpanded, setIsFormExpanded] = useToggle();
  const totalCols = environments.length + 2; // secret key row + icon
  const [isSecretVisible, setIsSecretVisible] = useToggle();
  const [isEditSecretNameOpen, setIsEditSecretNameOpen] = useState(false);
  const [isSecNameCopied, setIsSecNameCopied] = useToggle(false);
  const [creatingOverrideEnvs, setCreatingOverrideEnvs] = useState<Set<string>>(new Set());

  const isSingleEnvView = environments.length === 1;
  const { projectId } = useProject();
  const { mutateAsync: updateSecretV3ForRename } = useUpdateSecretV3();

  // Pre-compute single-env data
  const singleEnvSlug = isSingleEnvView ? environments[0].slug : "";
  const singleEnvName = isSingleEnvView ? environments[0].name : "";
  const singleEnvSecret = isSingleEnvView ? getSecretByKey(singleEnvSlug, secretKey) : undefined;
  const singleEnvIsCreatable = isSingleEnvView ? !singleEnvSecret : false;
  const singleEnvIsImported = isSingleEnvView
    ? isImportedSecretPresentInEnv(singleEnvSlug, secretKey)
    : false;
  const singleEnvImportedSecret = isSingleEnvView
    ? getImportedSecretByKey(singleEnvSlug, secretKey)
    : undefined;
  const singleEnvHasOverride = isSingleEnvView ? Boolean(singleEnvSecret?.idOverride) : false;
  const singleEnvIsCreatingOverride = isSingleEnvView
    ? creatingOverrideEnvs.has(singleEnvSlug)
    : false;
  const singleEnvShowOverride = singleEnvHasOverride || singleEnvIsCreatingOverride;

  const handleSecretRename = async (newName: string) => {
    if (!isSingleEnvView || !singleEnvSecret) return;
    try {
      await updateSecretV3ForRename({
        environment: singleEnvSecret.env,
        projectId,
        secretPath,
        secretKey: singleEnvSecret.key,
        type: SecretType.Shared,
        newSecretName: newName
      });
      createNotification({ type: "success", text: "Successfully renamed the secret" });
    } catch {
      createNotification({ type: "error", text: "Error renaming the secret" });
    }
  };

  // Clean up creatingOverrideEnvs once the query refetch confirms the override exists.
  // This prevents the override row from flickering between "creating" and "has override" states.
  useEffect(() => {
    if (creatingOverrideEnvs.size === 0) return;

    const toRemove: string[] = [];
    creatingOverrideEnvs.forEach((slug) => {
      const secret = getSecretByKey(slug, secretKey);
      if (secret?.idOverride) {
        toRemove.push(slug);
      }
    });

    if (toRemove.length > 0) {
      setCreatingOverrideEnvs((prev) => {
        const next = new Set(prev);
        toRemove.forEach((slug) => next.delete(slug));
        return next;
      });
    }
  }, [creatingOverrideEnvs, getSecretByKey, secretKey]);

  const copyTokenToClipboard = () => {
    navigator.clipboard.writeText(secretKey);
    setIsSecNameCopied.on();
  };

  const { permission } = useProjectPermission();

  const getDefaultValue = (
    secret: SecretV3RawSanitized | undefined,
    importedSecret: { secret?: SecretV3RawSanitized } | undefined
  ) => {
    const canEditSecretValue = permission.can(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, {
        environment: secret?.env || "",
        secretPath: secret?.path || "",
        secretName: secret?.key || "",
        secretTags: ["*"]
      })
    );

    if (secret?.secretValueHidden) {
      return canEditSecretValue ? HIDDEN_SECRET_VALUE : "";
    }
    return secret?.value || importedSecret?.secret?.value || "";
  };

  return (
    <>
      <UnstableTableRow
        onClick={isSingleEnvView ? undefined : () => setIsFormExpanded.toggle()}
        className="group"
      >
        <UnstableTableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-0 z-10",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isFormExpanded && "border-b-0 bg-container-hover",
            isSingleEnvView && singleEnvShowOverride && "border-b-border/50",
            isSingleEnvView && "pt-3 align-top"
          )}
        >
          <Checkbox
            variant="project"
            id={`checkbox-${secretKey}`}
            isChecked={isSelected}
            onCheckedChange={() => {
              onToggleSecretSelect(secretKey);
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            className={twMerge("hidden group-hover:flex", isSelected && "flex")}
          />
          {!isSingleEnvView && isFormExpanded ? (
            <ChevronDownIcon
              className={twMerge("block group-hover:!hidden", isSelected && "!hidden")}
            />
          ) : (
            <KeyIcon
              className={twMerge("block text-secret group-hover:!hidden", isSelected && "!hidden")}
            />
          )}
        </UnstableTableCell>
        {isSingleEnvView ? (
          <SecretEditTableRow
            isSingleEnvView
            onSecretRename={handleSecretRename}
            secretPath={secretPath}
            isVisible={isSecretVisible}
            secretName={secretKey}
            isEmpty={singleEnvSecret?.isEmpty || singleEnvImportedSecret?.secret?.isEmpty}
            secretValueHidden={singleEnvSecret?.secretValueHidden || false}
            defaultValue={getDefaultValue(singleEnvSecret, singleEnvImportedSecret)}
            secretId={singleEnvSecret?.id}
            isOverride={Boolean(singleEnvSecret?.idOverride)}
            isImportedSecret={singleEnvIsImported}
            importedSecret={singleEnvImportedSecret}
            isCreatable={singleEnvIsCreatable}
            onSecretDelete={onSecretDelete}
            onSecretCreate={onSecretCreate}
            onSecretUpdate={onSecretUpdate}
            onAddOverride={() => {
              setCreatingOverrideEnvs((prev) => new Set([...prev, singleEnvSlug]));
            }}
            environment={singleEnvSlug}
            environmentName={singleEnvName}
            isRotatedSecret={singleEnvSecret?.isRotatedSecret}
            importedBy={importedBy}
            isSecretPresent={Boolean(singleEnvSecret)}
            comment={singleEnvSecret?.comment}
            tags={singleEnvSecret?.tags}
            secretMetadata={singleEnvSecret?.secretMetadata}
            skipMultilineEncoding={singleEnvSecret?.skipMultilineEncoding}
            reminder={singleEnvSecret?.reminder}
          />
        ) : (
          <UnstableTableCell
            isTruncatable
            className={twMerge(
              "sticky left-10 z-10 border-r bg-container transition-all duration-75 group-hover:bg-container-hover group-hover:pr-18",
              isFormExpanded && "border-r-0 border-b-0 bg-container-hover"
            )}
          >
            {secretKey}
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center transition-all duration-500 group-hover:space-x-1.5">
              <Tooltip delayDuration={300} disableHoverableContent>
                <TooltipTrigger>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      copyTokenToClipboard();
                    }}
                    className="w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100"
                  >
                    {isSecNameCopied ? <ClipboardCheckIcon /> : <CopyIcon />}
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>Copy Secret Name</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={300} disableHoverableContent>
                <TooltipTrigger>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    onClick={(e) => {
                      setIsEditSecretNameOpen(true);
                      e.stopPropagation();
                    }}
                    className="w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100"
                  >
                    <EditIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>Edit Secret Name</TooltipContent>
              </Tooltip>
            </div>
          </UnstableTableCell>
        )}
        {environments.length > 1 &&
          environments.map(({ slug }, i) => {
            if (isFormExpanded)
              return <UnstableTableCell className="border-b-0 bg-container-hover" />;

            const secret = getSecretByKey(slug, secretKey);

            const isSecretImported = isImportedSecretPresentInEnv(slug, secretKey);

            const isSecretPresent = Boolean(secret);
            const isSecretEmpty = secret?.isEmpty;

            let status: EnvironmentStatus;

            if (isSecretEmpty) {
              status = "empty";
            } else if (isSecretPresent) {
              status = "present";
            } else if (isSecretImported) {
              status = "imported";
            } else {
              status = "missing";
            }

            return (
              <ResourceEnvironmentStatusCell
                key={`sec-overview-${slug}-${i + 1}-value`}
                status={status}
                hasOverride={Boolean(secret?.idOverride)}
              />
            );
          })}
      </UnstableTableRow>
      {isSingleEnvView && singleEnvShowOverride && (
        <UnstableTableRow className="group bg-gradient-to-r from-override/[0.03] from-[1%] via-override/[0.075] to-override/[0.03] to-[99%]">
          <UnstableTableCell>
            <GitBranchIcon className="text-override" />
          </UnstableTableCell>
          <UnstableTableCell className="border-r text-override">{secretKey}</UnstableTableCell>
          <UnstableTableCell>
            <SecretOverrideRow
              isSingleEnvView
              secretName={secretKey}
              environment={singleEnvSlug}
              secretPath={secretPath}
              isVisible={isSecretVisible}
              isOverrideEmpty={singleEnvSecret?.isOverrideEmpty}
              idOverride={singleEnvSecret?.idOverride}
              valueOverride={singleEnvSecret?.valueOverride}
              isCreatingOverride={singleEnvIsCreatingOverride}
              onCreatingOverrideChange={(value) => {
                setCreatingOverrideEnvs((prev) => {
                  const next = new Set(prev);
                  if (value) {
                    next.add(singleEnvSlug);
                  } else {
                    next.delete(singleEnvSlug);
                  }
                  return next;
                });
              }}
              onSecretCreate={onSecretCreate}
              onSecretUpdate={onSecretUpdate}
              onSecretDelete={onSecretDelete}
            />
          </UnstableTableCell>
        </UnstableTableRow>
      )}
      {!isSingleEnvView && (
        <Modal
          isOpen={isEditSecretNameOpen}
          onOpenChange={(isOpen) => setIsEditSecretNameOpen(isOpen)}
        >
          <ModalContent title="Edit Secret Name">
            <SecretRenameForm
              secretKey={secretKey}
              environments={environments}
              secretPath={secretPath}
              getSecretByKey={getSecretByKey}
            />
          </ModalContent>
        </Modal>
      )}
      {!isSingleEnvView && isFormExpanded && (
        <UnstableTableRow>
          <UnstableTableCell colSpan={totalCols} className={`${isFormExpanded && "bg-card p-0"}`}>
            <div
              style={{ minWidth: tableWidth, maxWidth: tableWidth }}
              className="sticky left-0 flex flex-col gap-y-4 border-t-2 border-b-1 border-l-1 border-border border-x-project/50 bg-card p-4"
            >
              <UnstableTable containerClassName="border-none rounded-none bg-transparent">
                <UnstableTableHeader className="">
                  <UnstableTableRow className="border-none">
                    <UnstableTableHead>Environment</UnstableTableHead>
                    <UnstableTableHead className="w-full">Value</UnstableTableHead>
                    <div className="absolute top-0 right-0">
                      <Button variant="ghost" size="xs" onClick={() => setIsSecretVisible.toggle()}>
                        {isSecretVisible ? (
                          <>
                            <EyeOffIcon />
                            Hide
                          </>
                        ) : (
                          <>
                            <EyeIcon />
                            Reveal
                          </>
                        )}{" "}
                        Values
                      </Button>
                    </div>
                  </UnstableTableRow>
                </UnstableTableHeader>
                <UnstableTableBody>
                  {environments.map(({ name, slug }) => {
                    const secret = getSecretByKey(slug, secretKey);
                    const isCreatable = !secret;

                    const isImportedSecret = isImportedSecretPresentInEnv(slug, secretKey);
                    const importedSecret = getImportedSecretByKey(slug, secretKey);

                    const hasOverride = Boolean(secret?.idOverride);
                    const isCreatingOverride = creatingOverrideEnvs.has(slug);
                    const showOverrideRow = hasOverride || isCreatingOverride;

                    return (
                      <>
                        <UnstableTableRow
                          className="group"
                          key={`secret-expanded-${slug}-${secretKey}`}
                        >
                          <UnstableTableCell
                            className={hasOverride ? "border-b-border/50" : undefined}
                          >
                            <div title={name} className="flex h-8 w-32 items-center space-x-2">
                              <span className="truncate">{name}</span>
                              {isImportedSecret && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <ImportIcon className="size-4 text-import" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Imported from {importedSecret?.environmentInfo?.name}{" "}
                                    environment
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {secret?.isRotatedSecret && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <RefreshCcwIcon className="size-4 text-secret-rotation" />
                                  </TooltipTrigger>
                                  <TooltipContent>Rotated secret</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </UnstableTableCell>
                          <UnstableTableCell
                            className={twMerge("col-span-2", hasOverride && "border-b-border/50")}
                          >
                            <SecretEditTableRow
                              secretPath={secretPath}
                              isVisible={isSecretVisible}
                              secretName={secretKey}
                              isEmpty={secret?.isEmpty || importedSecret?.secret?.isEmpty}
                              secretValueHidden={secret?.secretValueHidden || false}
                              defaultValue={getDefaultValue(secret, importedSecret)}
                              secretId={secret?.id}
                              isOverride={Boolean(secret?.idOverride)}
                              isImportedSecret={isImportedSecret}
                              importedSecret={importedSecret}
                              isCreatable={isCreatable}
                              onSecretDelete={onSecretDelete}
                              onSecretCreate={onSecretCreate}
                              onSecretUpdate={onSecretUpdate}
                              onAddOverride={() => {
                                setCreatingOverrideEnvs((prev) => new Set([...prev, slug]));
                              }}
                              environment={slug}
                              environmentName={name}
                              isRotatedSecret={secret?.isRotatedSecret}
                              importedBy={importedBy}
                              isSecretPresent={Boolean(secret)}
                              comment={secret?.comment}
                              tags={secret?.tags}
                              secretMetadata={secret?.secretMetadata}
                              skipMultilineEncoding={secret?.skipMultilineEncoding}
                              reminder={secret?.reminder}
                            />
                          </UnstableTableCell>
                        </UnstableTableRow>
                        {showOverrideRow && (
                          <UnstableTableRow
                            className="group bg-gradient-to-r from-override/[0.03] from-[1%] via-override/[0.075] to-override/[0.03] to-[99%]"
                            key={`secret-override-${slug}-${secretKey}`}
                          >
                            <UnstableTableCell />
                            <UnstableTableCell>
                              <SecretOverrideRow
                                secretName={secretKey}
                                environment={slug}
                                secretPath={secretPath}
                                isVisible={isSecretVisible}
                                isOverrideEmpty={secret?.isOverrideEmpty}
                                idOverride={secret?.idOverride}
                                valueOverride={secret?.valueOverride}
                                isCreatingOverride={isCreatingOverride}
                                onCreatingOverrideChange={(value) => {
                                  setCreatingOverrideEnvs((prev) => {
                                    const next = new Set(prev);
                                    if (value) {
                                      next.add(slug);
                                    } else {
                                      next.delete(slug);
                                    }
                                    return next;
                                  });
                                }}
                                onSecretCreate={onSecretCreate}
                                onSecretUpdate={onSecretUpdate}
                                onSecretDelete={onSecretDelete}
                              />
                            </UnstableTableCell>
                          </UnstableTableRow>
                        )}
                      </>
                    );
                  })}
                </UnstableTableBody>
              </UnstableTable>
            </div>
          </UnstableTableCell>
        </UnstableTableRow>
      )}
    </>
  );
};
