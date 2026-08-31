import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { subject } from "@casl/ability";
import {
  BanIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  CopyIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  GitBranchIcon,
  HexagonIcon,
  ImportIcon,
  KeyIcon,
  RefreshCcwIcon,
  RefreshCwIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Modal, ModalContent } from "@app/components/v2";
import {
  Badge,
  Button,
  Checkbox,
  IconButton,
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
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { useUpdateSecretV3 } from "@app/hooks/api";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { SecretType, SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { ProjectEnv } from "@app/hooks/api/types";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import { pendingActionBorderClass, pendingActionRowClass } from "../pendingActionStyles";
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
  isExpanded: boolean;
  onToggleExpand: (key: string) => void;
  isSecretVisible: boolean;
  onToggleSecretVisible: (key: string) => void;
  getSecretByKey: (slug: string, key: string) => SecretV3RawSanitized | undefined;
  onSecretCreate: (env: string, key: string, value: string, type?: SecretType) => Promise<void>;
  onSecretUpdate: (params: {
    env: string;
    key: string;
    value: string | undefined;
    secretValueHidden: boolean;
    type?: SecretType;
    secretId?: string;
    newSecretName?: string;
    secretComment?: string;
    tags?: { id: string; slug: string }[];
    secretMetadata?: { key: string; value: string; isEncrypted?: boolean }[];
    skipMultilineEncoding?: boolean | null;
    originalValue?: string;
  }) => Promise<void>;
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
  isSingleEnvSecretsVisible?: boolean;
  isBatchMode?: boolean;
  onBatchRevert?: (env: string, key: string) => void;
  isSelectionDisabled?: boolean;
  virtualIndex: number;
  measureElement: (node: Element | null) => void;
  onUnsavedChange?: (secretKey: string, hasUnsavedChanges: boolean) => void;
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
  isExpanded,
  onToggleExpand,
  isSecretVisible,
  onToggleSecretVisible,
  importedBy,
  isSingleEnvSecretsVisible,
  isBatchMode,
  onBatchRevert,
  isSelectionDisabled,
  virtualIndex,
  measureElement,
  onUnsavedChange
}: Props) => {
  const totalCols = environments.length + 2; // secret key row + icon
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  const setRowRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      rowRef.current = node;
      measureElement(node);
    },
    [measureElement]
  );

  // A logical secret row spans one <tr> plus, when present, its override or expanded
  // sibling <tr>; re-measure the whole group on every render so the virtualizer tracks
  // the override/expanded toggles and the value input growing as the user types.
  useLayoutEffect(() => {
    if (rowRef.current) measureElement(rowRef.current);
  });
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
  const singleEnvPendingAction = isSingleEnvView
    ? (singleEnvSecret as SecretV3RawSanitized & { pendingAction?: PendingAction })?.pendingAction
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

  // A row can hold more than one editor (one per environment in the expanded multi-env view, plus
  // override editors), so collapse them to a single answer for the virtualized parent.
  const unsavedEditorIdsRef = useRef(new Set<string>());
  const hasOverrideDraftRef = useRef(false);

  const reportUnsavedChanges = useCallback(() => {
    onUnsavedChange?.(
      secretKey,
      unsavedEditorIdsRef.current.size > 0 || hasOverrideDraftRef.current
    );
  }, [onUnsavedChange, secretKey]);

  const handleEditorUnsavedChange = useCallback(
    (id: string, hasUnsavedChanges: boolean) => {
      if (hasUnsavedChanges) unsavedEditorIdsRef.current.add(id);
      else unsavedEditorIdsRef.current.delete(id);
      reportUnsavedChanges();
    },
    [reportUnsavedChanges]
  );

  // A freshly opened override row has an empty, clean form, so it reports nothing unsaved; the row
  // still has to stay mounted or the draft row vanishes when the user scrolls past it.
  useEffect(() => {
    hasOverrideDraftRef.current = creatingOverrideEnvs.size > 0;
    reportUnsavedChanges();
  }, [creatingOverrideEnvs, reportUnsavedChanges]);

  useEffect(() => () => onUnsavedChange?.(secretKey, false), [onUnsavedChange, secretKey]);

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
      <TableRow
        ref={setRowRef}
        data-index={virtualIndex}
        onClick={isSingleEnvView ? undefined : () => onToggleExpand(secretKey)}
        className={twMerge("group hover:z-10", pendingActionRowClass(singleEnvPendingAction))}
      >
        <TableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-0 z-10",
            !singleEnvPendingAction &&
              "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-b-0 bg-container-hover",
            isSingleEnvView && singleEnvShowOverride && "border-b-border/50",
            isSingleEnvView && "relative pt-3 align-top",
            pendingActionBorderClass(singleEnvPendingAction)
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
            className={twMerge(
              "hidden",
              !isSelectionDisabled && "group-hover:flex",
              isSelected && "flex"
            )}
          />
          {!isSingleEnvView && isExpanded ? (
            <ChevronDownIcon
              className={twMerge(
                "block",
                !isSelectionDisabled && "group-hover:!hidden",
                isSelected && "!hidden"
              )}
            />
          ) : (
            <>
              <KeyIcon
                className={twMerge(
                  "block text-secret",
                  !isSelectionDisabled && "group-hover:!hidden",
                  isSelected && "!hidden"
                )}
              />
              {singleEnvSecret?.isRotatedSecret && isSingleEnvView && (
                <RefreshCwIcon
                  className={twMerge(
                    "absolute right-2 bottom-2 !size-2.5 text-secret-rotation",
                    !isSelectionDisabled && "group-hover:!hidden",
                    isSelected && "!hidden"
                  )}
                />
              )}
              {singleEnvSecret?.isHoneyTokenSecret && isSingleEnvView && (
                <HexagonIcon
                  className={twMerge(
                    "absolute right-2 bottom-2 !size-2.5 text-yellow",
                    !isSelectionDisabled && "group-hover:!hidden",
                    isSelected && "!hidden"
                  )}
                />
              )}
            </>
          )}
        </TableCell>
        {isSingleEnvView ? (
          <SecretEditTableRow
            isSingleEnvView
            unsavedChangeId={singleEnvSlug}
            onUnsavedChange={handleEditorUnsavedChange}
            isBatchMode={isBatchMode}
            onBatchRevert={onBatchRevert}
            isPendingCreate={singleEnvPendingAction === PendingAction.Create}
            isPendingDelete={singleEnvPendingAction === PendingAction.Delete}
            hasPendingChange={Boolean(singleEnvSecret?.isPending)}
            hasPendingValueChange={Boolean(singleEnvSecret?.hasPendingValueChange)}
            pendingKeyName={
              singleEnvSecret?.isPending && singleEnvSecret.key !== secretKey
                ? singleEnvSecret.key
                : undefined
            }
            onSecretRename={handleSecretRename}
            secretPath={secretPath}
            isVisible={isSecretVisible || isSingleEnvSecretsVisible}
            secretName={secretKey}
            isEmpty={
              singleEnvSecret ? singleEnvSecret.isEmpty : singleEnvImportedSecret?.secret?.isEmpty
            }
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
            isHoneyTokenSecret={singleEnvSecret?.isHoneyTokenSecret}
            importedBy={importedBy}
            isSecretPresent={Boolean(singleEnvSecret)}
            comment={singleEnvSecret?.comment}
            tags={singleEnvSecret?.tags}
            secretMetadata={singleEnvSecret?.secretMetadata}
            skipMultilineEncoding={singleEnvSecret?.skipMultilineEncoding}
            reminder={singleEnvSecret?.reminder}
            revokedProjectFolderGrant={singleEnvSecret?.revokedProjectFolderGrant}
          />
        ) : (
          <TableCell
            isTruncatable
            className={twMerge(
              "sticky left-10 z-10 border-r bg-container transition-all duration-75 group-hover:bg-container-hover",
              isExpanded && "border-r-0 border-b-0 bg-container-hover"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={twMerge(
                  singleEnvPendingAction === PendingAction.Delete && "text-danger/75 line-through"
                )}
              >
                {secretKey}
              </span>
              {!isExpanded &&
                environments.some(
                  ({ slug }) => getSecretByKey(slug, secretKey)?.revokedProjectFolderGrant
                ) && (
                  <Badge variant="danger">
                    <BanIcon className="size-3.5" />
                    Secret share revoked
                  </Badge>
                )}
            </div>
            <div
              className={twMerge(
                "absolute z-20",
                "flex items-center rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
                "pointer-events-none opacity-0 transition-all duration-300",
                "group-hover:pointer-events-auto group-hover:gap-1 group-hover:opacity-100",
                "top-1/2 right-[3px] -translate-y-1/2"
              )}
            >
              <Tooltip disableHoverableContent>
                <TooltipTrigger>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      copyTokenToClipboard();
                    }}
                    className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                  >
                    {isSecNameCopied ? <ClipboardCheckIcon /> : <CopyIcon />}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>Copy Secret Name</TooltipContent>
              </Tooltip>
              <Tooltip disableHoverableContent>
                <TooltipTrigger>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    onClick={(e) => {
                      setIsEditSecretNameOpen(true);
                      e.stopPropagation();
                    }}
                    className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                  >
                    <EditIcon />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>Edit Secret Name</TooltipContent>
              </Tooltip>
            </div>
          </TableCell>
        )}
        {environments.length > 1 &&
          environments.map(({ slug }, i) => {
            if (isExpanded) return <TableCell className="border-b-0 bg-container-hover" />;

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
      </TableRow>
      {isSingleEnvView && singleEnvShowOverride && (
        <TableRow
          data-index={virtualIndex}
          className="group bg-gradient-to-r from-override/[0.03] from-[1%] via-override/[0.075] to-override/[0.03] to-[99%]"
        >
          <TableCell>
            <GitBranchIcon className="text-override" />
          </TableCell>
          <TableCell className="border-r text-override">{secretKey}</TableCell>
          <TableCell>
            <SecretOverrideRow
              isSingleEnvView
              unsavedChangeId={`${singleEnvSlug}-override`}
              onUnsavedChange={handleEditorUnsavedChange}
              secretName={secretKey}
              environment={singleEnvSlug}
              secretPath={secretPath}
              isVisible={isSecretVisible || isSingleEnvSecretsVisible}
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
          </TableCell>
        </TableRow>
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
      {!isSingleEnvView && isExpanded && (
        <TableRow data-index={virtualIndex}>
          <TableCell colSpan={totalCols} className={`${isExpanded && "bg-card p-0"}`}>
            <div
              style={{ minWidth: tableWidth, maxWidth: tableWidth }}
              className="sticky left-0 flex flex-col gap-y-4 border-t-2 border-b-1 border-l-1 border-border border-x-project/50 bg-card p-4"
            >
              <Table containerClassName="border-none rounded-none bg-transparent">
                <TableHeader className="">
                  <TableRow className="border-none">
                    <TableHead isTruncatable className="w-px min-w-40 lg:min-w-64 xl:min-w-80">
                      Environment
                    </TableHead>
                    <TableHead className="w-full">Value</TableHead>
                    <div className="absolute top-0 right-0">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => onToggleSecretVisible(secretKey)}
                      >
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {environments.map(({ name, slug }) => {
                    const secret = getSecretByKey(slug, secretKey);
                    const isCreatable = !secret;

                    const isImportedSecret = isImportedSecretPresentInEnv(slug, secretKey);
                    const importedSecret = getImportedSecretByKey(slug, secretKey);

                    const hasOverride = Boolean(secret?.idOverride);
                    const isCreatingOverride = creatingOverrideEnvs.has(slug);
                    const showOverrideRow = hasOverride || isCreatingOverride;

                    return (
                      <Fragment key={`secret-expanded-${slug}-${secretKey}`}>
                        <TableRow className="group hover:z-10">
                          <TableCell
                            isTruncatable
                            className={hasOverride ? "border-b-border/50" : undefined}
                          >
                            <div className="flex h-8 items-center space-x-2">
                              <Tooltip disableHoverableContent>
                                <TooltipTrigger asChild>
                                  <span className="truncate">{name}</span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-2xl break-all">
                                  {name}
                                </TooltipContent>
                              </Tooltip>
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
                              {secret?.isHoneyTokenSecret && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HexagonIcon className="size-4 text-yellow" />
                                  </TooltipTrigger>
                                  <TooltipContent>Honey Token secret</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className={twMerge("col-span-2", hasOverride && "border-b-border/50")}
                          >
                            <SecretEditTableRow
                              unsavedChangeId={slug}
                              onUnsavedChange={handleEditorUnsavedChange}
                              secretPath={secretPath}
                              isVisible={isSecretVisible}
                              secretName={secretKey}
                              isEmpty={secret ? secret.isEmpty : importedSecret?.secret?.isEmpty}
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
                              isHoneyTokenSecret={secret?.isHoneyTokenSecret}
                              importedBy={importedBy}
                              isSecretPresent={Boolean(secret)}
                              comment={secret?.comment}
                              tags={secret?.tags}
                              secretMetadata={secret?.secretMetadata}
                              skipMultilineEncoding={secret?.skipMultilineEncoding}
                              reminder={secret?.reminder}
                              revokedProjectFolderGrant={secret?.revokedProjectFolderGrant}
                            />
                          </TableCell>
                        </TableRow>
                        {showOverrideRow && (
                          <TableRow
                            className="group bg-gradient-to-r from-override/[0.03] from-[1%] via-override/[0.075] to-override/[0.03] to-[99%]"
                            key={`secret-override-${slug}-${secretKey}`}
                          >
                            <TableCell />
                            <TableCell>
                              <SecretOverrideRow
                                unsavedChangeId={`${slug}-override`}
                                onUnsavedChange={handleEditorUnsavedChange}
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
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};
