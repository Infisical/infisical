import { useEffect } from "react";
import Link from "next/link";
import {
  faArrowDown,
  faArrowUp,
  faArrowUpRightFromSquare,
  faCancel,
  faCheckCircle,
  faEdit,
  faEllipsis,
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
  Badge,
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
import { BadgeProps } from "@app/components/v2/Badge/Badge";
import {
  ProjectPermissionActions,
  ProjectPermissionCmekActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { usePagination, usePopUp } from "@app/hooks";
import { useGetCmeksByProjectId, useUpdateCmek } from "@app/hooks/api/cmeks";
import { CmekOrderBy, TCmek } from "@app/hooks/api/cmeks/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

import { CmekDecryptModal } from "./CmekDecryptModal";
import { CmekEncryptModal } from "./CmekEncryptModal";
import { CmekModal } from "./CmekModal";
import { DeleteCmekModal } from "./DeleteCmekModal";

const getStatusBadgeProps = (
  isDisabled: boolean
): { variant: BadgeProps["variant"]; label: string } => {
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
  const { currentWorkspace } = useWorkspace();
  const { permission } = useProjectPermission();

  const projectId = currentWorkspace?.id ?? "";

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
  } = usePagination(CmekOrderBy.Name);

  const { data, isLoading, isFetching } = useGetCmeksByProjectId({
    projectId,
    offset,
    limit,
    search: debouncedSearch,
    orderBy,
    orderDirection
  });

  const { keys = [], totalCount = 0 } = data ?? {};
  useEffect(() => {
    // reset page if no longer valid
    if (totalCount <= offset) setPage(1);
  }, [totalCount]);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "upsertKey",
    "deleteKey",
    "encryptData",
    "decryptData"
  ] as const);

  const handleSort = () => {
    setOrderDirection((prev) =>
      prev === OrderByDirection.ASC ? OrderByDirection.DESC : OrderByDirection.ASC
    );
  };

  const updateCmek = useUpdateCmek();

  const handleDisableCmek = async ({ id: keyId, isDisabled }: TCmek) => {
    try {
      await updateCmek.mutateAsync({
        keyId,
        projectId,
        isDisabled: !isDisabled
      });

      createNotification({
        text: `Key successfully ${isDisabled ? "enabled" : "disabled"}`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text =
        error?.response?.data?.message ?? `Failed to ${isDisabled ? "enable" : "disable"} key`;

      createNotification({
        text,
        type: "error"
      });
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
          <p className="whitespace-nowrap text-xl font-semibold text-mineshaft-100">Keys</p>
          <div className="flex w-full justify-end pr-4">
            <Link href="https://infisical.com/docs/documentation/platform/kms">
              <span className="w-max cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
                Documentation{" "}
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.06rem] ml-1 text-xs"
                />
              </span>
            </Link>
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
                <Th className="w-1/3">
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
                <Th>Algorithm</Th>
                <Th>Status</Th>
                <Th>Version</Th>
                <Th className="w-16">{isFetching ? <Spinner size="xs" /> : null}</Th>
              </Tr>
            </THead>
            <TBody>
              {isLoading && <TableSkeleton columns={4} innerKey="project-keys" />}
              {!isLoading &&
                keys.length > 0 &&
                keys.map((cmek) => {
                  const { name, id, version, description, encryptionAlgorithm, isDisabled } = cmek;
                  const { variant, label } = getStatusBadgeProps(isDisabled);

                  return (
                    <Tr className="group h-10 hover:bg-mineshaft-700" key={`st-v3-${id}`}>
                      <Td>
                        <div className="flex items-center gap-2">
                          {name}
                          {description && (
                            <Tooltip content={description}>
                              <FontAwesomeIcon
                                icon={faInfoCircle}
                                className=" text-mineshaft-400"
                              />
                            </Tooltip>
                          )}
                        </div>
                      </Td>
                      <Td className="uppercase">{encryptionAlgorithm}</Td>
                      <Td>
                        <Badge variant={variant}>{label}</Badge>
                      </Td>
                      <Td>{version}</Td>
                      <Td className="flex justify-end">
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
                          <DropdownMenuContent className="min-w-[160px]">
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
                                    <FontAwesomeIcon icon={isDisabled ? faCheckCircle : faCancel} />
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
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isLoading && totalCount > 0 && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
            />
          )}
          {!isLoading && keys.length === 0 && (
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
      </div>
    </motion.div>
  );
};
