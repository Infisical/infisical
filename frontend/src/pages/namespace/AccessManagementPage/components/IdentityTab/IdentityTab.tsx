import {
  faArrowDown,
  faArrowUp,
  faArrowUpRightFromSquare,
  faBookOpen,
  faCircleXmark,
  faClock,
  faCubes,
  faEllipsisV,
  faGlobe,
  faMagnifyingGlass,
  faPlus,
  faServer
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { NamespacePermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Pagination,
  Spinner,
  Table,
  TableContainer,
  TableSkeleton,
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useNamespace } from "@app/context";
import {
  NamespacePermissionIdentityActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { withNamespacePermission } from "@app/hoc";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useDeleteNamespaceIdentity } from "@app/hooks/api/namespaceIdentity";
import {
  NamespaceIdentityMembershipOrderBy,
  namespaceIdentityMembershipQueryKeys,
  useDeleteNamespaceIdentityMembership
} from "@app/hooks/api/namespaceIdentityMembership";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddIdentityNamespaceModal } from "./components";

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;

export const IdentityTab = withNamespacePermission(
  () => {
    const { namespaceId } = useNamespace();
    const navigate = useNavigate();

    const {
      offset,
      limit,
      orderBy,
      setOrderBy,
      orderDirection,
      setOrderDirection,
      search,
      debouncedSearch,
      setPage,
      setSearch,
      perPage,
      page,
      setPerPage
    } = usePagination(NamespaceIdentityMembershipOrderBy.Name, {
      initPerPage: getUserTablePreference("namespaceIdentityTable", PreferenceKey.PerPage, 20)
    });

    const handlePerPageChange = (newPerPage: number) => {
      setPerPage(newPerPage);
      setUserTablePreference("projectIdentityTable", PreferenceKey.PerPage, newPerPage);
    };

    const { data, isPending, isFetching } = useQuery({
      ...namespaceIdentityMembershipQueryKeys.list({
        limit,
        offset,
        search,
        namespaceId,
        orderBy,
        orderDirection
      }),
      placeholderData: (prevData) => prevData
    });

    const { totalCount = 0 } = data ?? {};

    useResetPageHelper({
      totalCount,
      offset,
      setPage
    });

    const { mutateAsync: deleteNamespaceIdentity } = useDeleteNamespaceIdentity();
    const { mutateAsync: deleteNamespaceIdentityMembership } =
      useDeleteNamespaceIdentityMembership();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "deleteIdentity",
      "linkIdentity",
      "unlinkFromNamespace",
      "upgradePlan"
    ] as const);

    const onRemoveIdentitySubmit = async (identityId: string) => {
      try {
        await deleteNamespaceIdentity({
          identityId,
          namespaceId
        });

        createNotification({
          text: "Successfully deleted identity",
          type: "success"
        });

        handlePopUpClose("deleteIdentity");
      } catch (err) {
        console.error(err);
        const error = err as any;
        const text = error?.response?.data?.message ?? "Failed to remove identity from project";

        createNotification({
          text,
          type: "error"
        });
      }
    };

    const onUnlinkOrgIdentitySubmit = async (identityId: string) => {
      try {
        await deleteNamespaceIdentityMembership({
          identityId,
          namespaceId
        });

        createNotification({
          text: "Successfully removed identity from namespace",
          type: "success"
        });

        handlePopUpClose("unlinkFromNamespace");
      } catch (err) {
        console.error(err);
        const error = err as any;
        const text = error?.response?.data?.message ?? "Failed to remove identity from project";

        createNotification({
          text,
          type: "error"
        });
      }
    };

    const handleSort = (column: NamespaceIdentityMembershipOrderBy) => {
      if (column === orderBy) {
        setOrderDirection((prev) =>
          prev === OrderByDirection.ASC ? OrderByDirection.DESC : OrderByDirection.ASC
        );
        return;
      }

      setOrderBy(column);
      setOrderDirection(OrderByDirection.ASC);
    };

    return (
      <motion.div
        key="identity-role-panel"
        transition={{ duration: 0.15 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
      >
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <p className="text-xl font-semibold text-mineshaft-100">Identities</p>
              <a
                href="https://infisical.com/docs/documentation/platform/identities/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="mt-[0.16rem] ml-1 inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  <span>Docs</span>
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.07rem] ml-1.5 text-[10px]"
                  />
                </div>
              </a>
            </div>
            <div>
              <NamespacePermissionCan
                I={NamespacePermissionIdentityActions.Create}
                a={NamespacePermissionSubjects.Identity}
              >
                {(isAllowed) => (
                  <Button
                    variant="outline_bg"
                    type="submit"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => handlePopUpOpen("linkIdentity")}
                    isDisabled={!isAllowed}
                    className="h-10 rounded-r-none"
                  >
                    Add Namespace Identity
                  </Button>
                )}
              </NamespacePermissionCan>
            </div>
          </div>
          <Input
            containerClassName="mb-4"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search identities by name..."
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
                        className={`ml-2 ${
                          orderBy === NamespaceIdentityMembershipOrderBy.Name ? "" : "opacity-30"
                        }`}
                        ariaLabel="sort"
                        onClick={() => handleSort(NamespaceIdentityMembershipOrderBy.Name)}
                      >
                        <FontAwesomeIcon
                          icon={
                            orderDirection === OrderByDirection.DESC &&
                            orderBy === NamespaceIdentityMembershipOrderBy.Name
                              ? faArrowUp
                              : faArrowDown
                          }
                        />
                      </IconButton>
                    </div>
                  </Th>
                  <Th className="w-1/3">Role</Th>
                  <Th>Added on</Th>
                  <Th>Managed By</Th>
                  <Th className="w-5">{isFetching ? <Spinner size="xs" /> : null}</Th>
                </Tr>
              </THead>
              <TBody>
                {isPending && <TableSkeleton columns={4} innerKey="project-identities" />}
                {!isPending &&
                  data &&
                  data.identityMemberships.length > 0 &&
                  data.identityMemberships.map((identityMember) => {
                    const {
                      identity: { id, name, scopeNamespaceId },
                      roles,
                      createdAt
                    } = identityMember;

                    return (
                      <Tr
                        className="group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                        key={`st-v3-${id}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(evt) => {
                          if (evt.key === "Enter") {
                            navigate({
                              to: "/organization/namespaces/$namespaceId/identities/$identityId",
                              params: {
                                namespaceId,
                                identityId: id
                              }
                            });
                          }
                        }}
                        onClick={() =>
                          navigate({
                            to: "/organization/namespaces/$namespaceId/identities/$identityId",
                            params: {
                              namespaceId,
                              identityId: id
                            }
                          })
                        }
                      >
                        <Td>{name}</Td>
                        <Td>
                          <div className="flex items-center space-x-2">
                            {roles
                              .slice(0, MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                              .map(
                                ({
                                  role,
                                  customRoleName,
                                  id: roleId,
                                  isTemporary,
                                  temporaryAccessEndTime
                                }) => {
                                  const isExpired =
                                    new Date() > new Date(temporaryAccessEndTime || ("" as string));
                                  return (
                                    <Tag key={roleId}>
                                      <div className="flex items-center space-x-2">
                                        <div className="capitalize">{customRoleName || role}</div>
                                        {isTemporary && (
                                          <div>
                                            <Tooltip
                                              content={
                                                isExpired
                                                  ? "Timed role expired"
                                                  : "Timed role access"
                                              }
                                            >
                                              <FontAwesomeIcon
                                                icon={faClock}
                                                className={twMerge(isExpired && "text-red-600")}
                                              />
                                            </Tooltip>
                                          </div>
                                        )}
                                      </div>
                                    </Tag>
                                  );
                                }
                              )}
                            {roles.length > MAX_ROLES_TO_BE_SHOWN_IN_TABLE && (
                              <HoverCard>
                                <HoverCardTrigger>
                                  <Tag>+{roles.length - MAX_ROLES_TO_BE_SHOWN_IN_TABLE}</Tag>
                                </HoverCardTrigger>
                                <HoverCardContent className="border border-gray-700 bg-mineshaft-800 p-4">
                                  {roles
                                    .slice(MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                                    .map(
                                      ({
                                        role,
                                        customRoleName,
                                        id: roleId,
                                        isTemporary,
                                        temporaryAccessEndTime
                                      }) => {
                                        const isExpired =
                                          new Date() >
                                          new Date(temporaryAccessEndTime || ("" as string));
                                        return (
                                          <Tag key={roleId} className="capitalize">
                                            <div className="flex items-center space-x-2">
                                              <div>{customRoleName || role}</div>
                                              {isTemporary && (
                                                <div>
                                                  <Tooltip
                                                    content={
                                                      isExpired
                                                        ? "Access expired"
                                                        : "Temporary access"
                                                    }
                                                  >
                                                    <FontAwesomeIcon
                                                      icon={faClock}
                                                      className={twMerge(
                                                        new Date() >
                                                          new Date(
                                                            temporaryAccessEndTime as string
                                                          ) && "text-red-600"
                                                      )}
                                                    />
                                                  </Tooltip>
                                                </div>
                                              )}
                                            </div>
                                          </Tag>
                                        );
                                      }
                                    )}
                                </HoverCardContent>
                              </HoverCard>
                            )}
                          </div>
                        </Td>
                        <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                        <Td>
                          {!scopeNamespaceId ? (
                            <Link
                              to="/organization/identities/$identityId"
                              params={{
                                identityId: id
                              }}
                              className="underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="truncate">
                                <FontAwesomeIcon
                                  size="sm"
                                  className="mr-1.5 text-mineshaft-300/75"
                                  icon={faGlobe}
                                />
                                Organization
                              </p>
                            </Link>
                          ) : (
                            <Link
                              to="/organization/namespaces/$namespaceId/identities/$identityId"
                              params={{
                                namespaceId,
                                identityId: id
                              }}
                              className="underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="truncate">
                                <FontAwesomeIcon
                                  size="sm"
                                  className="mr-1.5 text-mineshaft-300/75"
                                  icon={faCubes}
                                />
                                Namespace
                              </p>
                            </Link>
                          )}
                        </Td>
                        <Td className="flex justify-end space-x-2">
                          <Tooltip className="max-w-sm text-center" content="Options">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton
                                  ariaLabel="Options"
                                  colorSchema="secondary"
                                  className="w-6"
                                  variant="plain"
                                >
                                  <FontAwesomeIcon icon={faEllipsisV} />
                                </IconButton>
                              </DropdownMenuTrigger>
                              {scopeNamespaceId ? (
                                <DropdownMenuContent sideOffset={2} align="end">
                                  <NamespacePermissionCan
                                    I={NamespacePermissionIdentityActions.Delete}
                                    a={NamespacePermissionSubjects.Identity}
                                  >
                                    {(isAllowed) => (
                                      <DropdownMenuItem
                                        icon={<FontAwesomeIcon icon={faCircleXmark} />}
                                        isDisabled={!isAllowed}
                                        onClick={(evt) => {
                                          evt.stopPropagation();
                                          evt.preventDefault();
                                          handlePopUpOpen("deleteIdentity", {
                                            identityId: id,
                                            name
                                          });
                                        }}
                                      >
                                        Delete identity
                                      </DropdownMenuItem>
                                    )}
                                  </NamespacePermissionCan>
                                </DropdownMenuContent>
                              ) : (
                                <DropdownMenuContent sideOffset={2} align="end">
                                  <NamespacePermissionCan
                                    I={NamespacePermissionIdentityActions.Delete}
                                    a={NamespacePermissionSubjects.Identity}
                                  >
                                    {(isAllowed) => (
                                      <DropdownMenuItem
                                        icon={<FontAwesomeIcon icon={faCircleXmark} />}
                                        isDisabled={!isAllowed}
                                        onClick={(evt) => {
                                          evt.stopPropagation();
                                          evt.preventDefault();
                                          handlePopUpOpen("unlinkFromNamespace", {
                                            identityId: id,
                                            name
                                          });
                                        }}
                                      >
                                        Unlink org identity
                                      </DropdownMenuItem>
                                    )}
                                  </NamespacePermissionCan>
                                </DropdownMenuContent>
                              )}
                            </DropdownMenu>
                          </Tooltip>
                        </Td>
                      </Tr>
                    );
                  })}
              </TBody>
            </Table>
            {!isPending && data && totalCount > 0 && (
              <Pagination
                count={totalCount}
                page={page}
                perPage={perPage}
                onChangePage={(newPage) => setPage(newPage)}
                onChangePerPage={handlePerPageChange}
              />
            )}
            {!isPending && data && data?.identityMemberships.length === 0 && (
              <EmptyState
                title={
                  debouncedSearch.trim().length > 0
                    ? "No identities match search filter"
                    : "No identities have been added to this project"
                }
                icon={faServer}
              />
            )}
          </TableContainer>
          <Modal
            isOpen={popUp?.linkIdentity?.isOpen}
            onOpenChange={(isOpen) => {
              handlePopUpToggle("linkIdentity", isOpen);
            }}
          >
            <ModalContent
              title="Add Identity to Namespace"
              subTitle="Create a new identity or assign an existing identity"
              bodyClassName="overflow-visible"
            >
              <AddIdentityNamespaceModal
                handlePopUpToggle={() => handlePopUpToggle("linkIdentity")}
              />
            </ModalContent>
          </Modal>
          <DeleteActionModal
            isOpen={popUp.unlinkFromNamespace.isOpen}
            title={`Are you sure you want to unlink ${
              (popUp?.deleteIdentity?.data as { name: string })?.name || ""
            } from the namespace?`}
            onChange={(isOpen) => handlePopUpToggle("unlinkFromNamespace", isOpen)}
            deleteKey="confirm"
            onDeleteApproved={() =>
              onUnlinkOrgIdentitySubmit(
                (popUp?.unlinkFromNamespace?.data as { identityId: string })?.identityId
              )
            }
          />
          <DeleteActionModal
            isOpen={popUp.deleteIdentity.isOpen}
            title={`Are you sure you want to delete ${
              (popUp?.deleteIdentity?.data as { name: string })?.name || ""
            }?`}
            onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
            deleteKey="confirm"
            onDeleteApproved={() =>
              onRemoveIdentitySubmit(
                (popUp?.deleteIdentity?.data as { identityId: string })?.identityId
              )
            }
          />
        </div>
      </motion.div>
    );
  },
  { action: NamespacePermissionIdentityActions.Read, subject: NamespacePermissionSubjects.Identity }
);
