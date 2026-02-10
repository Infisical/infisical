import { useEffect, useState } from "react";
import { subject } from "@casl/ability";
import {
  ChevronDownIcon,
  ClipboardCheckIcon,
  CopyIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  ImportIcon,
  KeyIcon,
  RefreshCcwIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

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
import { useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
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
    value: string,
    secretValueHidden: boolean,
    type?: SecretType,
    secretId?: string
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
      <UnstableTableRow onClick={() => setIsFormExpanded.toggle()} className="group">
        <UnstableTableCell
          className={twMerge(
            "sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover",
            isFormExpanded && "border-b-0 bg-container-hover"
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
          {isFormExpanded ? (
            <ChevronDownIcon
              className={twMerge("block group-hover:!hidden", isSelected && "!hidden")}
            />
          ) : (
            <KeyIcon
              className={twMerge("block text-secret group-hover:!hidden", isSelected && "!hidden")}
            />
          )}
        </UnstableTableCell>
        <UnstableTableCell
          isTruncatable
          className={twMerge(
            "sticky left-10 z-10 border-r bg-container transition-all duration-75 group-hover:bg-container-hover group-hover:pr-18",
            isFormExpanded && "border-r-0 border-b-0 bg-container-hover"
          )}
        >
          {secretKey}
          <div className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 transition-all duration-75 group-hover:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    copyTokenToClipboard();
                  }}
                  className="mr-1"
                >
                  {isSecNameCopied ? <ClipboardCheckIcon /> : <CopyIcon />}
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Copy Secret Name</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  onClick={(e) => {
                    setIsEditSecretNameOpen(true);
                    e.stopPropagation();
                  }}
                >
                  <EditIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Edit Secret Name</TooltipContent>
            </Tooltip>
          </div>
        </UnstableTableCell>
        {environments.map(({ slug }, i) => {
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
      {isFormExpanded && (
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
                              isEmpty={secret?.isEmpty}
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
                                isEmpty={secret?.isEmpty}
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
