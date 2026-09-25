import { ReactNode, useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CircleXIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  FileSignatureIcon,
  ImportIcon,
  InfoIcon,
  KeyIcon,
  LockIcon,
  PencilIcon,
  RotateCwIcon,
  SearchIcon,
  TrashIcon,
  UnlockIcon
} from "lucide-react";
import { motion } from "motion/react";
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
  SelectedActionBar,
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
import { formatKmsKeyAlgorithm, kmsKeyUsageOptions } from "@app/helpers/kms";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  usePagination,
  usePopUp,
  useResetPageHelper,
  useSlashFocusSearch,
  useTimedReset
} from "@app/hooks";
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

import { CmekBulkImportModal } from "./CmekBulkImportModal";
import { CmekDecryptModal } from "./CmekDecryptModal";
import { CmekEncryptModal } from "./CmekEncryptModal";
import { CmekExportKeyModal } from "./CmekExportKeyModal";
import { CmekGenerateMacModal } from "./CmekGenerateMacModal";
import { CmekModal } from "./CmekModal";
import { CmekSignModal } from "./CmekSignModal";
import { CmekVerifyMacModal } from "./CmekVerifyMacModal";
import { CmekVerifyModal } from "./CmekVerifyModal";
import { DeleteCmekModal } from "./DeleteCmekModal";
import { cmekKeysToExportJSON, downloadJSON } from "./jsonExport";
import { RotateCmekModal } from "./RotateCmekModal";

const getStatusBadgeProps = (
  isDisabled: boolean
): { variant: TBadgeProps["variant"]; label: string } => {
  if (isDisabled) {
    return { variant: "danger", label: "Disabled" };
  }
  return { variant: "success", label: "Active" };
};

const KeyAction = ({
  children,
  onClick,
  disabledReason,
  variant
}: {
  children: ReactNode;
  onClick: () => void;
  disabledReason?: string;
  variant?: "danger";
}) => (
  <Tooltip open={disabledReason ? undefined : false}>
    <TooltipTrigger asChild>
      <DropdownMenuItem
        onClick={onClick}
        isDisabled={Boolean(disabledReason)}
        isDisabledFocusable={Boolean(disabledReason)}
        variant={variant}
      >
        {children}
      </DropdownMenuItem>
    </TooltipTrigger>
    <TooltipContent side="left">{disabledReason}</TooltipContent>
  </Tooltip>
);

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  useSlashFocusSearch(searchInputRef);

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

  const selectableKeys = keys.filter((k) => !k.isDisabled && k.isExportable);
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
    "rotateKey",
    "encryptData",
    "decryptData",
    "signData",
    "verifyData",
    "generateMac",
    "verifyMac",
    "exportKey",
    "importKeys"
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
  const cannotGenerateMac = permission.cannot(
    ProjectPermissionCmekActions.GenerateMac,
    ProjectPermissionSub.Cmek
  );
  const cannotVerifyMac = permission.cannot(
    ProjectPermissionCmekActions.VerifyMac,
    ProjectPermissionSub.Cmek
  );
  const cannotRotateKey = permission.cannot(
    ProjectPermissionCmekActions.Rotate,
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
      <SelectedActionBar
        selectedCount={selectedKeyIds.length}
        onClearSelection={() => setSelectedKeyIds([])}
      >
        <ProjectPermissionCan
          I={ProjectPermissionCmekActions.ExportPrivateKey}
          a={ProjectPermissionSub.Cmek}
          renderTooltip
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="project"
                    size="xs"
                    onClick={handleBulkExport}
                    isDisabled={!isAllowed}
                    isPending={bulkExportMutation.isPending}
                  >
                    <DownloadIcon className="mr-1 size-4" />
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
      </SelectedActionBar>

      <Card>
        <CardHeader>
          <CardTitle>
            Keys
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/kms" />
          </CardTitle>
          <CardDescription>Manage keys and perform cryptographic operations.</CardDescription>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="project">
                  <ChevronDownIcon />
                  Add Key
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Create}
                  a={ProjectPermissionSub.Cmek}
                >
                  {(isAllowed) => (
                    <Tooltip open={!isAllowed ? undefined : false}>
                      <TooltipTrigger className="block w-full">
                        <DropdownMenuItem
                          onClick={() => handlePopUpOpen("upsertKey", null)}
                          isDisabled={!isAllowed}
                        >
                          <KeyIcon className="size-4" />
                          Create Key
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent side="left">Access Restricted</TooltipContent>
                    </Tooltip>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Create}
                  a={ProjectPermissionSub.Cmek}
                >
                  {(isAllowed) => (
                    <Tooltip open={!isAllowed ? undefined : false}>
                      <TooltipTrigger className="block w-full">
                        <DropdownMenuItem
                          onClick={() => handlePopUpOpen("importKeys")}
                          isDisabled={!isAllowed}
                        >
                          <ImportIcon className="size-4" />
                          Import Keys
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent side="left">Access Restricted</TooltipContent>
                    </Tooltip>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
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
                ref={searchInputRef}
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
                  <TableHead className="w-5" />
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending &&
                  Array.from({ length: 5 }).map((_, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`skeleton-${i}`}>
                      {Array.from({ length: 9 }).map((__, j) => (
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
                      algorithm,
                      isDisabled,
                      isExportable,
                      hasDeleteProtection,
                      keyUsage
                    } = cmek;
                    const { variant, label } = getStatusBadgeProps(isDisabled);
                    const isSelected = selectedKeyIds.includes(id);

                    const isAsymmetricKey = Object.values(AsymmetricKeyAlgorithm).includes(
                      algorithm as AsymmetricKeyAlgorithm
                    );
                    // unexportable asymmetric keys can still surface their public key in the export modal
                    const cannotExportKey = isAsymmetricKey
                      ? (cannotExportPrivateKey || !isExportable) && cannotReadKey
                      : cannotExportPrivateKey || !isExportable;
                    const disabledKeyReason = isDisabled ? "This key is disabled" : undefined;
                    let exportDisabledReason = disabledKeyReason;
                    if (cannotExportKey) {
                      exportDisabledReason =
                        cannotExportPrivateKey && (!isAsymmetricKey || cannotReadKey)
                          ? "Access Restricted"
                          : "This key was created as non-exportable";
                    }
                    let deleteDisabledReason: string | undefined;
                    if (cannotDeleteKey) {
                      deleteDisabledReason = "Access Restricted";
                    } else if (hasDeleteProtection) {
                      deleteDisabledReason =
                        "Disable delete protection on this key before deleting it";
                    }

                    return (
                      <TableRow
                        key={`cmek-${id}`}
                        className="group"
                        data-state={isSelected ? "selected" : undefined}
                        onMouseLeave={() => setCopyCipherText("")}
                      >
                        <TableCell>
                          {isDisabled || !isExportable ? (
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
                              <TooltipContent>
                                {isDisabled
                                  ? "Disabled keys cannot be exported"
                                  : "This key was created as non-exportable"}
                              </TooltipContent>
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
                              {isCopyingCiphertext ? (
                                <CheckIcon className="size-4" />
                              ) : (
                                <CopyIcon className="size-4" />
                              )}
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
                        <TableCell>{formatKmsKeyAlgorithm(algorithm)}</TableCell>
                        <TableCell>
                          <Badge variant={variant}>{label}</Badge>
                        </TableCell>
                        <TableCell>{version}</TableCell>
                        <TableCell>
                          {!isExportable && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <LockIcon className="size-4 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent>
                                This key was created as non-exportable
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell variant="action">
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton variant="ghost" size="sm" aria-label="More options">
                                  <EllipsisIcon className="size-4" />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[160px]">
                                {keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT && (
                                  <>
                                    <KeyAction
                                      onClick={() => handlePopUpOpen("encryptData", cmek)}
                                      disabledReason={
                                        cannotEncryptData ? "Access Restricted" : disabledKeyReason
                                      }
                                    >
                                      <LockIcon className="mr-2 size-4" />
                                      Encrypt Data
                                    </KeyAction>
                                    <KeyAction
                                      onClick={() => handlePopUpOpen("decryptData", cmek)}
                                      disabledReason={
                                        cannotDecryptData ? "Access Restricted" : disabledKeyReason
                                      }
                                    >
                                      <UnlockIcon className="mr-2 size-4" />
                                      Decrypt Data
                                    </KeyAction>
                                  </>
                                )}
                                {keyUsage === KmsKeyUsage.SIGN_VERIFY && (
                                  <>
                                    <KeyAction
                                      onClick={() => handlePopUpOpen("signData", cmek)}
                                      disabledReason={
                                        cannotSignData ? "Access Restricted" : disabledKeyReason
                                      }
                                    >
                                      <FileSignatureIcon className="mr-2 size-4" />
                                      Sign Data
                                    </KeyAction>
                                    <KeyAction
                                      onClick={() => handlePopUpOpen("verifyData", cmek)}
                                      disabledReason={
                                        cannotVerifyData ? "Access Restricted" : disabledKeyReason
                                      }
                                    >
                                      <CircleCheckIcon className="mr-2 size-4" />
                                      Verify Data
                                    </KeyAction>
                                  </>
                                )}
                                {keyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC && (
                                  <>
                                    <KeyAction
                                      onClick={() => handlePopUpOpen("generateMac", cmek)}
                                      disabledReason={
                                        cannotGenerateMac ? "Access Restricted" : disabledKeyReason
                                      }
                                    >
                                      <FileSignatureIcon className="mr-2 size-4" />
                                      Generate MAC
                                    </KeyAction>
                                    <KeyAction
                                      onClick={() => handlePopUpOpen("verifyMac", cmek)}
                                      disabledReason={
                                        cannotVerifyMac ? "Access Restricted" : disabledKeyReason
                                      }
                                    >
                                      <CircleCheckIcon className="mr-2 size-4" />
                                      Verify MAC
                                    </KeyAction>
                                  </>
                                )}
                                <KeyAction
                                  onClick={() => handlePopUpOpen("exportKey", cmek)}
                                  disabledReason={exportDisabledReason}
                                >
                                  <DownloadIcon className="mr-2 size-4" />
                                  Export Key
                                </KeyAction>
                                <KeyAction
                                  onClick={() => handlePopUpOpen("upsertKey", cmek)}
                                  disabledReason={cannotEditKey ? "Access Restricted" : undefined}
                                >
                                  <PencilIcon className="mr-2 size-4" />
                                  Edit Key
                                </KeyAction>
                                {keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT && (
                                  <KeyAction
                                    onClick={() => handlePopUpOpen("rotateKey", cmek)}
                                    disabledReason={
                                      cannotRotateKey ? "Access Restricted" : disabledKeyReason
                                    }
                                  >
                                    <RotateCwIcon className="mr-2 size-4" />
                                    Rotate Key
                                  </KeyAction>
                                )}
                                <KeyAction
                                  onClick={() => handleDisableCmek(cmek)}
                                  disabledReason={cannotEditKey ? "Access Restricted" : undefined}
                                >
                                  {isDisabled ? (
                                    <CircleCheckIcon className="mr-2 size-4" />
                                  ) : (
                                    <CircleXIcon className="mr-2 size-4" />
                                  )}
                                  {isDisabled ? "Enable" : "Disable"} Key
                                </KeyAction>
                                <KeyAction
                                  onClick={() => handlePopUpOpen("deleteKey", cmek)}
                                  disabledReason={deleteDisabledReason}
                                  variant="danger"
                                >
                                  <TrashIcon className="mr-2 size-4" />
                                  Delete Key
                                </KeyAction>
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
      <RotateCmekModal
        isOpen={popUp.rotateKey.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("rotateKey", isOpen)}
        cmek={popUp.rotateKey.data as TCmek}
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
      <CmekGenerateMacModal
        isOpen={popUp.generateMac.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("generateMac", isOpen)}
        cmek={popUp.generateMac.data as TCmek}
      />
      <CmekVerifyMacModal
        isOpen={popUp.verifyMac.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("verifyMac", isOpen)}
        cmek={popUp.verifyMac.data as TCmek}
      />
      <CmekExportKeyModal
        isOpen={popUp.exportKey.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("exportKey", isOpen)}
        cmek={popUp.exportKey.data as TCmek}
      />
      <CmekBulkImportModal
        isOpen={popUp.importKeys.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("importKeys", isOpen)}
        projectId={projectId}
      />
    </motion.div>
  );
};
