import {
  faArrowDown,
  faArrowUp,
  faArrowUpRightFromSquare,
  faCancel,
  faCheck,
  faCheckCircle,
  faCopy,
  faDownload,
  faEdit,
  faEllipsis,
  faFileSignature,
  faInfoCircle,
  faKey,
  faLock,
  faLockOpen,
  faMagnifyingGlass,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Spinner,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge, TBadgeProps } from "@app/components/v3";
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
import { useGetCmeksByProjectId, useUpdateCmek } from "@app/hooks/api/cmeks";
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

const getStatusBadgeProps = (
  isDisabled: boolean
): { variant: TBadgeProps["variant"]; label: string } => {
  if (isDisabled) {
    return {
      variant: "danger",
      label: "Disabled"
    };
  }

  return {
    variant: "success",
    label: "Active"
  };
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
  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

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

  const handleDisableCmek = async ({ id: keyId, isDisabled }: TCmek) => {
    await updateCmek.mutateAsync({
      keyId,
      projectId,
      isDisabled: !isDisabled
    });

    createNotification({
      text: `Key successfully ${isDisabled ? "enabled" : "disabled"}`,
      type: "success"
    });
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
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xl font-medium whitespace-nowrap text-mineshaft-100">Keys</p>
          <div className="flex w-full justify-end pr-4">
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://infisical.com/docs/documentation/platform/kms"
            >
              <span className="flex w-max cursor-pointer items-center rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
                Documentation{" "}
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.06rem] ml-1 text-xs"
                />
              </span>
            </a>
          </div>
          <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Cmek}>
            {(isAllowed) => (
              <Button
                colorSchema="primary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("upsertKey", null)}
                isDisabled={!isAllowed}
              >
                Add Key
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <Input
          containerClassName="mb-4"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search keys by name..."
        />
        <TableContainer>
          <Table>
            <THead>
              <Tr className="h-14">
                <Th>
                  <div className="flex items-center">
                    Name
                    <IconButton
                      variant="plain"
                      className="ml-2"
                      ariaLabel="sort"
                      onClick={handleSort}
                    >
                      <FontAwesomeIcon
                        icon={orderDirection === OrderByDirection.DESC ? faArrowUp : faArrowDown}
                      />
                    </IconButton>
                  </div>
                </Th>
                <Th>Key ID</Th>
                <Th>Key Usage</Th>
                <Th>Algorithm</Th>
                <Th>Status</Th>
                <Th>Version</Th>
                <Th className="w-16">{isFetching ? <Spinner size="xs" /> : null}</Th>
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={5} innerKey="project-keys" />}
              {!isPending &&
                keys.length > 0 &&
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

                  return (
                    <Tr
                      className="group h-10 hover:bg-mineshaft-700"
                      key={`st-v3-${id}`}
                      onMouseLeave={() => {
                        setCopyCipherText("");
                      }}
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          {name}
                          {description && (
                            <Tooltip content={description}>
                              <FontAwesomeIcon icon={faInfoCircle} className="text-mineshaft-400" />
                            </Tooltip>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <div>
                          <span> {id}</span>
                          <IconButton
                            ariaLabel="copy icon"
                            colorSchema="secondary"
                            size="xs"
                            className="group/copy duration:0 invisible relative ml-3 rounded-md group-hover:visible"
                            onClick={() => {
                              navigator.clipboard.writeText(id);
                              setCopyCipherText("Copied");
                            }}
                          >
                            <FontAwesomeIcon icon={isCopyingCiphertext ? faCheck : faCopy} />
                          </IconButton>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          {kmsKeyUsageOptions[keyUsage].label}
                          <Tooltip content={kmsKeyUsageOptions[keyUsage].tooltip}>
                            <FontAwesomeIcon icon={faInfoCircle} className="text-mineshaft-400" />
                          </Tooltip>
                        </div>
                      </Td>
                      <Td className="uppercase">{encryptionAlgorithm}</Td>
                      <Td>
                        <Badge variant={variant}>{label}</Badge>
                      </Td>
                      <Td>{version}</Td>
                      <Td>
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="plain"
                                colorSchema="primary"
                                className="ml-4 p-0 data-[state=open]:text-primary-400"
                                ariaLabel="More options"
                              >
                                <FontAwesomeIcon size="lg" icon={faEllipsis} />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="min-w-[160px]" sideOffset={2}>
                              {keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT && (
                                <>
                                  <Tooltip
                                    content={
                                      // eslint-disable-next-line no-nested-ternary
                                      cannotEncryptData
                                        ? "Access Restricted"
                                        : isDisabled
                                          ? "Key Disabled"
                                          : ""
                                    }
                                    position="left"
                                  >
                                    <div>
                                      <DropdownMenuItem
                                        onClick={() => handlePopUpOpen("encryptData", cmek)}
                                        icon={<FontAwesomeIcon icon={faLock} />}
                                        iconPos="left"
                                        isDisabled={cannotEncryptData || isDisabled}
                                      >
                                        Encrypt Data
                                      </DropdownMenuItem>
                                    </div>
                                  </Tooltip>
                                  <Tooltip
                                    content={
                                      // eslint-disable-next-line no-nested-ternary
                                      cannotDecryptData
                                        ? "Access Restricted"
                                        : isDisabled
                                          ? "Key Disabled"
                                          : ""
                                    }
                                    position="left"
                                  >
                                    <div>
                                      <DropdownMenuItem
                                        onClick={() => handlePopUpOpen("decryptData", cmek)}
                                        icon={<FontAwesomeIcon icon={faLockOpen} />}
                                        iconPos="left"
                                        isDisabled={cannotDecryptData || isDisabled}
                                      >
                                        Decrypt Data
                                      </DropdownMenuItem>
                                    </div>
                                  </Tooltip>
                                </>
                              )}

                              {keyUsage === KmsKeyUsage.SIGN_VERIFY && (
                                <>
                                  <Tooltip
                                    content={
                                      // eslint-disable-next-line no-nested-ternary
                                      cannotSignData
                                        ? "Access Restricted"
                                        : isDisabled
                                          ? "Key Disabled"
                                          : ""
                                    }
                                    position="left"
                                  >
                                    <div>
                                      <DropdownMenuItem
                                        onClick={() => handlePopUpOpen("signData", cmek)}
                                        icon={<FontAwesomeIcon icon={faFileSignature} />}
                                        iconPos="left"
                                        isDisabled={cannotSignData || isDisabled}
                                      >
                                        Sign Data
                                      </DropdownMenuItem>
                                    </div>
                                  </Tooltip>
                                  <Tooltip
                                    content={
                                      // eslint-disable-next-line no-nested-ternary
                                      cannotVerifyData
                                        ? "Access Restricted"
                                        : isDisabled
                                          ? "Key Disabled"
                                          : ""
                                    }
                                    position="left"
                                  >
                                    <div>
                                      <DropdownMenuItem
                                        onClick={() => handlePopUpOpen("verifyData", cmek)}
                                        icon={<FontAwesomeIcon icon={faCheckCircle} />}
                                        iconPos="left"
                                        isDisabled={cannotVerifyData || isDisabled}
                                      >
                                        Verify Data
                                      </DropdownMenuItem>
                                    </div>
                                  </Tooltip>
                                </>
                              )}

                              {(() => {
                                // For asymmetric keys, user can export if they have Read OR ExportPrivateKey permission
                                // For symmetric keys, user needs ExportPrivateKey permission
                                const isAsymmetricKey = Object.values(
                                  AsymmetricKeyAlgorithm
                                ).includes(encryptionAlgorithm as AsymmetricKeyAlgorithm);
                                const cannotExportKey = isAsymmetricKey
                                  ? cannotExportPrivateKey && cannotReadKey
                                  : cannotExportPrivateKey;

                                return (
                                  <Tooltip
                                    content={
                                      // eslint-disable-next-line no-nested-ternary
                                      cannotExportKey
                                        ? "Access Restricted"
                                        : isDisabled
                                          ? "Key Disabled"
                                          : ""
                                    }
                                    position="left"
                                  >
                                    <div>
                                      <DropdownMenuItem
                                        onClick={() => handlePopUpOpen("exportKey", cmek)}
                                        icon={<FontAwesomeIcon icon={faDownload} />}
                                        iconPos="left"
                                        isDisabled={cannotExportKey || isDisabled}
                                      >
                                        Export Key
                                      </DropdownMenuItem>
                                    </div>
                                  </Tooltip>
                                );
                              })()}
                              <Tooltip
                                content={cannotEditKey ? "Access Restricted" : ""}
                                position="left"
                              >
                                <div>
                                  <DropdownMenuItem
                                    onClick={() => handlePopUpOpen("upsertKey", cmek)}
                                    icon={<FontAwesomeIcon icon={faEdit} />}
                                    iconPos="left"
                                    isDisabled={cannotEditKey}
                                  >
                                    Edit Key
                                  </DropdownMenuItem>
                                </div>
                              </Tooltip>
                              <Tooltip
                                content={cannotEditKey ? "Access Restricted" : ""}
                                position="left"
                              >
                                <div>
                                  <DropdownMenuItem
                                    onClick={() => handleDisableCmek(cmek)}
                                    icon={
                                      <FontAwesomeIcon
                                        icon={isDisabled ? faCheckCircle : faCancel}
                                      />
                                    }
                                    iconPos="left"
                                    isDisabled={cannotEditKey}
                                  >
                                    {isDisabled ? "Enable" : "Disable"} Key
                                  </DropdownMenuItem>
                                </div>
                              </Tooltip>
                              <Tooltip
                                content={cannotDeleteKey ? "Access Restricted" : ""}
                                position="left"
                              >
                                <div>
                                  <DropdownMenuItem
                                    onClick={() => handlePopUpOpen("deleteKey", cmek)}
                                    icon={<FontAwesomeIcon icon={faTrash} />}
                                    iconPos="left"
                                    isDisabled={cannotDeleteKey}
                                  >
                                    Delete Key
                                  </DropdownMenuItem>
                                </div>
                              </Tooltip>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isPending && totalCount > 0 && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={handlePerPageChange}
            />
          )}
          {!isPending && keys.length === 0 && (
            <EmptyState
              title={
                debouncedSearch.trim().length > 0
                  ? "No keys match search filter"
                  : "No keys have been added to this project"
              }
              icon={faKey}
            />
          )}
        </TableContainer>
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
      </div>
    </motion.div>
  );
};
