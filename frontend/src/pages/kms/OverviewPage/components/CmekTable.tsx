import { useState } from "react";
import {
  faCancel,
  faCheck,
  faCheckCircle,
  faCopy,
  faDownload,
  faEdit,
  faEllipsis,
  faFileSignature,
  faLock,
  faLockOpen,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { ChevronDownIcon, InfoIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Spinner } from "@app/components/v2";
import {
  Badge,
  Button,
  Checkbox,
  DocumentationLinkBadge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  TBadgeProps,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionCmekActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { kmsKeyUsageOptions } from "@app/helpers/kms";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper, useTimedReset } from "@app/hooks";
import {
  useBulkExportCmekPrivateKeys,
  useGetCmeksByProjectId,
  useUpdateCmek
} from "@app/hooks/api/cmeks";
import {
  AsymmetricKeyAlgorithm,
  CmekOrderBy,
  KmsKeyUsage,
  TCmek
} from "@app/hooks/api/cmeks/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

import { CmekDecryptModal } from "./CmekDecryptModal";
import { CmekEncryptModal } from "./CmekEncryptModal";
import { CmekExportKeyModal } from "./CmekExportKeyModal";
import { CmekModal } from "./CmekModal";
import { CmekSignModal } from "./CmekSignModal";
import { CmekVerifyModal } from "./CmekVerifyModal";
import { DeleteCmekModal } from "./DeleteCmekModal";
import { cmekKeysToExportJSON, downloadJSON } from "./jsonExport";

const getStatusBadgeProps = (
  isDisabled: boolean
): { variant: TBadgeProps["variant"]; label: string } => {
  if (isDisabled) {
    return { variant: "danger", label: "Disabled" };
  }
  return { variant: "success", label: "Active" };
};

export const CmekTable = () => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  const projectId = currentProject?.id ?? "";

  const {
    offset,
    limit,
    orderBy,
    orderDirection,
    setOrderDirection,
    search,
    debouncedSearch,
    setPage,
    setSearch,
    perPage,
    page,
    setPerPage
  } = usePagination(CmekOrderBy.Name, {
    initPerPage: getUserTablePreference("cmekClientTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("cmekClientTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isPending, isFetching } = useGetCmeksByProjectId({
    projectId,
    offset,
    limit,
    search: debouncedSearch,
    orderBy,
    orderDirection
  });

  const { keys = [], totalCount = 0 } = data ?? {};
  useResetPageHelper({ totalCount, offset, setPage });

  const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([]);

  const isPageSelected = keys.length > 0 && keys.every((k) => selectedKeyIds.includes(k.id));
  const isPageIndeterminate = !isPageSelected && keys.some((k) => selectedKeyIds.includes(k.id));

  const [, isCopyingCiphertext, setCopyCipherText] = useTimedReset<string>({
    initialState: "",
    delay: 1000
  });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "upsertKey",
    "deleteKey",
    "encryptData",
    "decryptData",
    "signData",
    "verifyData",
    "exportKey"
  ] as const);

  const handleSort = () => {
    setOrderDirection((prev) =>
      prev === OrderByDirection.ASC ? OrderByDirection.DESC : OrderByDirection.ASC
    );
  };

  const updateCmek = useUpdateCmek();
  const bulkExportMutation = useBulkExportCmekPrivateKeys();

  const handleDisableCmek = async ({ id: keyId, isDisabled }: TCmek) => {
    await updateCmek.mutateAsync({ keyId, projectId, isDisabled: !isDisabled });
    createNotification({
      text: `Key successfully ${isDisabled ? "enabled" : "disabled"}`,
      type: "success"
    });
  };

  const handleBulkExport = async () => {
    if (selectedKeyIds.length > 100) {
      createNotification({ text: "Cannot export more than 100 keys at once", type: "error" });
      return;
    }

    const { keys: exportedKeys } = await bulkExportMutation.mutateAsync({
      keyIds: selectedKeyIds
    });

    try {
      const exportData = cmekKeysToExportJSON(exportedKeys);
      downloadJSON(exportData, `kms-keys-export-${new Date().toISOString().slice(0, 10)}.json`);
      setSelectedKeyIds([]);
      createNotification({
        text: `Successfully exported ${exportedKeys.length} key(s)`,
        type: "success"
      });
    } catch {
      createNotification({ text: "Failed to export keys", type: "error" });
    }
  };

  const cannotEditKey = permission.cannot(
    ProjectPermissionCmekActions.Edit,
    ProjectPermissionSub.Cmek
  );
  const cannotDeleteKey = permission.cannot(
    ProjectPermissionCmekActions.Delete,
    ProjectPermissionSub.Cmek
  );
  const cannotEncryptData = permission.cannot(
    ProjectPermissionCmekActions.Encrypt,
    ProjectPermissionSub.Cmek
  );
  const cannotDecryptData = permission.cannot(
    ProjectPermissionCmekActions.Decrypt,
    ProjectPermissionSub.Cmek
  );
  const cannotSignData = permission.cannot(
    ProjectPermissionCmekActions.Sign,
    ProjectPermissionSub.Cmek
  );
  const cannotVerifyData = permission.cannot(
    ProjectPermissionCmekActions.Verify,
    ProjectPermissionSub.Cmek
  );
  const cannotExportPrivateKey = permission.cannot(
    ProjectPermissionCmekActions.ExportPrivateKey,
    ProjectPermissionSub.Cmek
  );
  const cannotReadKey = permission.cannot(
    ProjectPermissionCmekActions.Read,
    ProjectPermissionSub.Cmek
  );

  return (
    <motion.div
      key="kms-keys-tab"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <div
        className={twMerge(
          "mb-2 h-0 shrink-0 overflow-hidden transition-all",
          selectedKeyIds.length > 0 && "h-16"
        )}
      >
        <div className="mt-3.5 flex items-center rounded-md border border-border bg-card p-2 pl-4 text-foreground">
          <div className="mr-2 text-sm">{selectedKeyIds.length} Selected</div>
          <button
            type="button"
            className="mt-0.5 mr-auto text-xs text-accent underline-offset-2 hover:underline"
            onClick={() => setSelectedKeyIds([])}
          >
            Unselect All
          </button>
          <ProjectPermissionCan
            I={ProjectPermissionCmekActions.ExportPrivateKey}
            a={ProjectPermissionSub.Cmek}
            renderTooltip
          >
            {(isAllowed) => (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-2">
                    <Button
                      variant="project"
                      size="xs"
                      onClick={handleBulkExport}
                      isDisabled={!isAllowed}
                      isPending={bulkExportMutation.isPending}
                    >
                      <FontAwesomeIcon icon={faDownload} className="mr-1" />
                      Export
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {isAllowed
                    ? "Export all selected keys as a JSON file"
                    : "You don't have permission to export keys"}
                </TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        </div>
      </div>

      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            Keys
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/kms" />
          </UnstableCardTitle>
          <UnstableCardDescription>
            Manage keys and perform cryptographic operations.
          </UnstableCardDescription>
          <UnstableCardAction>
            <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Cmek}>
              {(isAllowed) => (
                <Button
                  variant="project"
                  onClick={() => handlePopUpOpen("upsertKey", null)}
                  isDisabled={!isAllowed}
                >
                  <FontAwesomeIcon icon={faPlus} className="mr-2" />
                  Add Key
                </Button>
              )}
            </ProjectPermissionCan>
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
          <div className="mb-4 flex items-center gap-2">
            <InputGroup className="flex-1">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                placeholder="Search keys by name..."
              />
            </InputGroup>
            {isFetching && <Spinner size="xs" />}
          </div>

          {!isPending && keys.length === 0 ? (
            <UnstableEmpty className="border">
              <UnstableEmptyHeader>
                <UnstableEmptyTitle>
                  {debouncedSearch.trim().length > 0
                    ? "No keys match search filter"
                    : "No keys have been added to this project"}
                </UnstableEmptyTitle>
                <UnstableEmptyDescription>
                  {debouncedSearch.trim().length > 0
                    ? "Try a different search term."
                    : "Add a key to get started."}
                </UnstableEmptyDescription>
              </UnstableEmptyHeader>
            </UnstableEmpty>
          ) : (
            <UnstableTable>
              <UnstableTableHeader>
                <UnstableTableRow>
                  <UnstableTableHead className="w-5">
                    <Checkbox
                      id="cmek-page-select"
                      isChecked={isPageSelected || isPageIndeterminate}
                      isIndeterminate={isPageIndeterminate}
                      variant="project"
                      onCheckedChange={() => {
                        if (isPageSelected) {
                          setSelectedKeyIds((prev) =>
                            prev.filter((id) => !keys.find((k) => k.id === id))
                          );
                        } else {
                          setSelectedKeyIds((prev) => {
                            const merged = [...new Set([...prev, ...keys.map((k) => k.id)])];
                            return merged.slice(0, 100);
                          });
                        }
                      }}
                    />
                  </UnstableTableHead>
                  <UnstableTableHead onClick={handleSort} className="cursor-pointer">
                    Name
                    <ChevronDownIcon
                      className={twMerge(
                        "ml-1 inline-block size-4 transition-transform",
                        orderDirection === OrderByDirection.DESC && "rotate-180"
                      )}
                    />
                  </UnstableTableHead>
                  <UnstableTableHead>Key ID</UnstableTableHead>
                  <UnstableTableHead>Key Usage</UnstableTableHead>
                  <UnstableTableHead>Algorithm</UnstableTableHead>
                  <UnstableTableHead>Status</UnstableTableHead>
                  <UnstableTableHead>Version</UnstableTableHead>
                  <UnstableTableHead className="w-12" />
                </UnstableTableRow>
              </UnstableTableHeader>
              <UnstableTableBody>
                {isPending &&
                  Array.from({ length: 5 }).map((_, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <UnstableTableRow key={`skeleton-${i}`}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <UnstableTableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </UnstableTableCell>
                      ))}
                    </UnstableTableRow>
                  ))}
                {!isPending &&
                  keys.map((cmek) => {
                    const {
                      name,
                      id,
                      version,
                      description,
                      encryptionAlgorithm,
                      isDisabled,
                      keyUsage
                    } = cmek;
                    const { variant, label } = getStatusBadgeProps(isDisabled);
                    const isSelected = selectedKeyIds.includes(id);

                    const isAsymmetricKey = Object.values(AsymmetricKeyAlgorithm).includes(
                      encryptionAlgorithm as AsymmetricKeyAlgorithm
                    );
                    const cannotExportKey = isAsymmetricKey
                      ? cannotExportPrivateKey && cannotReadKey
                      : cannotExportPrivateKey;

                    return (
                      <UnstableTableRow
                        key={`cmek-${id}`}
                        className="group"
                        data-state={isSelected ? "selected" : undefined}
                        onMouseLeave={() => setCopyCipherText("")}
                      >
                        <UnstableTableCell>
                          <Checkbox
                            id={`select-cmek-${id}`}
                            isChecked={isSelected}
                            variant="project"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isSelected && selectedKeyIds.length >= 100) {
                                createNotification({
                                  text: "Cannot select more than 100 keys at once",
                                  type: "error"
                                });
                                return;
                              }
                              setSelectedKeyIds((prev) =>
                                isSelected ? prev.filter((k) => k !== id) : [...prev, id]
                              );
                            }}
                          />
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <div className="flex items-center gap-2">
                            {name}
                            {description && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <InfoIcon className="size-3.5 text-muted opacity-0 transition-all group-hover:opacity-100" />
                                </TooltipTrigger>
                                <TooltipContent>{description}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <div className="flex items-center">
                            <span className="font-mono text-xs">{id}</span>
                            <UnstableIconButton
                              aria-label="copy key id"
                              variant="ghost"
                              size="xs"
                              className="invisible ml-2 group-hover:visible"
                              onClick={() => {
                                navigator.clipboard.writeText(id);
                                setCopyCipherText("Copied");
                              }}
                            >
                              <FontAwesomeIcon icon={isCopyingCiphertext ? faCheck : faCopy} />
                            </UnstableIconButton>
                          </div>
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <div className="flex items-center gap-2">
                            {kmsKeyUsageOptions[keyUsage].label}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <InfoIcon className="size-3.5 text-muted opacity-0 transition-all group-hover:opacity-100" />
                              </TooltipTrigger>
                              <TooltipContent>
                                {kmsKeyUsageOptions[keyUsage].tooltip}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </UnstableTableCell>
                        <UnstableTableCell className="uppercase">
                          {encryptionAlgorithm}
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <Badge variant={variant}>{label}</Badge>
                        </UnstableTableCell>
                        <UnstableTableCell>{version}</UnstableTableCell>
                        <UnstableTableCell>
                          <div className="flex justify-end">
                            <UnstableDropdownMenu>
                              <UnstableDropdownMenuTrigger asChild>
                                <UnstableIconButton
                                  variant="ghost"
                                  size="sm"
                                  aria-label="More options"
                                >
                                  <FontAwesomeIcon icon={faEllipsis} />
                                </UnstableIconButton>
                              </UnstableDropdownMenuTrigger>
                              <UnstableDropdownMenuContent align="end" className="min-w-[160px]">
                                {keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT && (
                                  <>
                                    <UnstableDropdownMenuItem
                                      onClick={() => handlePopUpOpen("encryptData", cmek)}
                                      isDisabled={cannotEncryptData || isDisabled}
                                    >
                                      <FontAwesomeIcon icon={faLock} className="mr-2" />
                                      Encrypt Data
                                    </UnstableDropdownMenuItem>
                                    <UnstableDropdownMenuItem
                                      onClick={() => handlePopUpOpen("decryptData", cmek)}
                                      isDisabled={cannotDecryptData || isDisabled}
                                    >
                                      <FontAwesomeIcon icon={faLockOpen} className="mr-2" />
                                      Decrypt Data
                                    </UnstableDropdownMenuItem>
                                  </>
                                )}
                                {keyUsage === KmsKeyUsage.SIGN_VERIFY && (
                                  <>
                                    <UnstableDropdownMenuItem
                                      onClick={() => handlePopUpOpen("signData", cmek)}
                                      isDisabled={cannotSignData || isDisabled}
                                    >
                                      <FontAwesomeIcon icon={faFileSignature} className="mr-2" />
                                      Sign Data
                                    </UnstableDropdownMenuItem>
                                    <UnstableDropdownMenuItem
                                      onClick={() => handlePopUpOpen("verifyData", cmek)}
                                      isDisabled={cannotVerifyData || isDisabled}
                                    >
                                      <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
                                      Verify Data
                                    </UnstableDropdownMenuItem>
                                  </>
                                )}
                                <UnstableDropdownMenuItem
                                  onClick={() => handlePopUpOpen("exportKey", cmek)}
                                  isDisabled={cannotExportKey || isDisabled}
                                >
                                  <FontAwesomeIcon icon={faDownload} className="mr-2" />
                                  Export Key
                                </UnstableDropdownMenuItem>
                                <UnstableDropdownMenuItem
                                  onClick={() => handlePopUpOpen("upsertKey", cmek)}
                                  isDisabled={cannotEditKey}
                                >
                                  <FontAwesomeIcon icon={faEdit} className="mr-2" />
                                  Edit Key
                                </UnstableDropdownMenuItem>
                                <UnstableDropdownMenuItem
                                  onClick={() => handleDisableCmek(cmek)}
                                  isDisabled={cannotEditKey}
                                >
                                  <FontAwesomeIcon
                                    icon={isDisabled ? faCheckCircle : faCancel}
                                    className="mr-2"
                                  />
                                  {isDisabled ? "Enable" : "Disable"} Key
                                </UnstableDropdownMenuItem>
                                <UnstableDropdownMenuItem
                                  onClick={() => handlePopUpOpen("deleteKey", cmek)}
                                  isDisabled={cannotDeleteKey}
                                  variant="danger"
                                >
                                  <FontAwesomeIcon icon={faTrash} className="mr-2" />
                                  Delete Key
                                </UnstableDropdownMenuItem>
                              </UnstableDropdownMenuContent>
                            </UnstableDropdownMenu>
                          </div>
                        </UnstableTableCell>
                      </UnstableTableRow>
                    );
                  })}
              </UnstableTableBody>
            </UnstableTable>
          )}

          {!isPending && totalCount > 0 && (
            <UnstablePagination
              className="mt-4"
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </UnstableCardContent>
      </UnstableCard>

      <DeleteCmekModal
        isOpen={popUp.deleteKey.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteKey", isOpen)}
        cmek={popUp.deleteKey.data as TCmek}
      />
      <CmekModal
        isOpen={popUp.upsertKey.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upsertKey", isOpen)}
        cmek={popUp.upsertKey.data as TCmek | null}
      />
      <CmekEncryptModal
        isOpen={popUp.encryptData.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("encryptData", isOpen)}
        cmek={popUp.encryptData.data as TCmek}
      />
      <CmekDecryptModal
        isOpen={popUp.decryptData.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("decryptData", isOpen)}
        cmek={popUp.decryptData.data as TCmek}
      />
      <CmekSignModal
        isOpen={popUp.signData.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("signData", isOpen)}
        cmek={popUp.signData.data as TCmek}
      />
      <CmekVerifyModal
        isOpen={popUp.verifyData.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("verifyData", isOpen)}
        cmek={popUp.verifyData.data as TCmek}
      />
      <CmekExportKeyModal
        isOpen={popUp.exportKey.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("exportKey", isOpen)}
        cmek={popUp.exportKey.data as TCmek}
      />
    </motion.div>
  );
};
