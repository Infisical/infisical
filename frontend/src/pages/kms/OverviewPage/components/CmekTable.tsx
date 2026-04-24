import { useEffect, useState } from "react";
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TBadgeProps,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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

  useEffect(() => {
    setSelectedKeyIds([]);
  }, [page]);

  const selectableKeys = keys.filter((k) => !k.isDisabled);
  const isPageSelected =
    selectableKeys.length > 0 && selectableKeys.every((k) => selectedKeyIds.includes(k.id));
  const isPageIndeterminate =
    !isPageSelected && selectableKeys.some((k) => selectedKeyIds.includes(k.id));

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
    if (!isDisabled) {
      setSelectedKeyIds((prev) => prev.filter((id) => id !== keyId));
    }
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

      <Card>
        <CardHeader>
          <CardTitle>
            Keys
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/kms" />
          </CardTitle>
          <CardDescription>Manage keys and perform cryptographic operations.</CardDescription>
          <CardAction>
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
          </CardAction>
        </CardHeader>
        <CardContent>
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
                placeholder="Search keys by name or ID..."
              />
            </InputGroup>
            {isFetching && <Spinner size="xs" />}
          </div>

          {!isPending && keys.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  {debouncedSearch.trim().length > 0
                    ? "No keys match search filter"
                    : "No keys have been added to this project"}
                </EmptyTitle>
                <EmptyDescription>
                  {debouncedSearch.trim().length > 0
                    ? "Try a different search term."
                    : "Add a key to get started."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-5">
                    <Checkbox
                      id="cmek-page-select"
                      isChecked={isPageSelected || isPageIndeterminate}
                      isIndeterminate={isPageIndeterminate}
                      isDisabled={selectableKeys.length === 0}
                      variant="project"
                      onCheckedChange={() => {
                        if (isPageSelected) {
                          setSelectedKeyIds((prev) =>
                            prev.filter((id) => !selectableKeys.find((k) => k.id === id))
                          );
                        } else {
                          setSelectedKeyIds((prev) => {
                            const merged = [
                              ...new Set([...prev, ...selectableKeys.map((k) => k.id)])
                            ];
                            return merged.slice(0, 100);
                          });
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead onClick={handleSort} className="cursor-pointer">
                    Name
                    <ChevronDownIcon
                      className={twMerge(
                        "ml-1 inline-block size-4 transition-transform",
                        orderDirection === OrderByDirection.DESC && "rotate-180"
                      )}
                    />
                  </TableHead>
                  <TableHead>Key ID</TableHead>
                  <TableHead>Key Usage</TableHead>
                  <TableHead>Algorithm</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending &&
                  Array.from({ length: 5 }).map((_, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`skeleton-${i}`}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
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
                      <TableRow
                        key={`cmek-${id}`}
                        className="group"
                        data-state={isSelected ? "selected" : undefined}
                        onMouseLeave={() => setCopyCipherText("")}
                      >
                        <TableCell>
                          {isDisabled ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <Checkbox
                                    id={`select-cmek-${id}`}
                                    isChecked={false}
                                    isDisabled
                                    variant="project"
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Disabled keys cannot be exported</TooltipContent>
                            </Tooltip>
                          ) : (
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
                          )}
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <span className="font-mono text-xs">{id}</span>
                            <IconButton
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
                            </IconButton>
                          </div>
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell className="uppercase">{encryptionAlgorithm}</TableCell>
                        <TableCell>
                          <Badge variant={variant}>{label}</Badge>
                        </TableCell>
                        <TableCell>{version}</TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton variant="ghost" size="sm" aria-label="More options">
                                  <FontAwesomeIcon icon={faEllipsis} />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[160px]">
                                {keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handlePopUpOpen("encryptData", cmek)}
                                      isDisabled={cannotEncryptData || isDisabled}
                                    >
                                      <FontAwesomeIcon icon={faLock} className="mr-2" />
                                      Encrypt Data
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handlePopUpOpen("decryptData", cmek)}
                                      isDisabled={cannotDecryptData || isDisabled}
                                    >
                                      <FontAwesomeIcon icon={faLockOpen} className="mr-2" />
                                      Decrypt Data
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {keyUsage === KmsKeyUsage.SIGN_VERIFY && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handlePopUpOpen("signData", cmek)}
                                      isDisabled={cannotSignData || isDisabled}
                                    >
                                      <FontAwesomeIcon icon={faFileSignature} className="mr-2" />
                                      Sign Data
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handlePopUpOpen("verifyData", cmek)}
                                      isDisabled={cannotVerifyData || isDisabled}
                                    >
                                      <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
                                      Verify Data
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handlePopUpOpen("exportKey", cmek)}
                                  isDisabled={cannotExportKey || isDisabled}
                                >
                                  <FontAwesomeIcon icon={faDownload} className="mr-2" />
                                  Export Key
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handlePopUpOpen("upsertKey", cmek)}
                                  isDisabled={cannotEditKey}
                                >
                                  <FontAwesomeIcon icon={faEdit} className="mr-2" />
                                  Edit Key
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDisableCmek(cmek)}
                                  isDisabled={cannotEditKey}
                                >
                                  <FontAwesomeIcon
                                    icon={isDisabled ? faCheckCircle : faCancel}
                                    className="mr-2"
                                  />
                                  {isDisabled ? "Enable" : "Disable"} Key
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handlePopUpOpen("deleteKey", cmek)}
                                  isDisabled={cannotDeleteKey}
                                  variant="danger"
                                >
                                  <FontAwesomeIcon icon={faTrash} className="mr-2" />
                                  Delete Key
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}

          {!isPending && totalCount > 0 && (
            <Pagination
              className="mt-4"
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </CardContent>
      </Card>

      <DeleteCmekModal
        isOpen={popUp.deleteKey.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteKey", isOpen)}
        cmek={popUp.deleteKey.data as TCmek}
        onDeleted={(deletedKeyId) =>
          setSelectedKeyIds((prev) => prev.filter((id) => id !== deletedKeyId))
        }
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
