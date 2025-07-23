import { subject } from "@casl/ability";
import {
  faArrowDown,
  faArrowUp,
  faArrowUpRightFromSquare,
  faBookOpen,
  faCircleXmark,
  faClock,
  faEllipsisV,
  faMagnifyingGlass,
  faPlus,
  faServer
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
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
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { formatProjectRoleName } from "@app/helpers/roles";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { withProjectPermission } from "@app/hoc";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useDeleteIdentityFromWorkspace, useGetWorkspaceIdentityMemberships } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectIdentityOrderBy } from "@app/hooks/api/workspace/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityModal } from "./components/IdentityModal";

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;

export const IdentityTab = withProjectPermission(
  () => {
    const { currentWorkspace } = useWorkspace();
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
    } = usePagination(ProjectIdentityOrderBy.Name, {
      initPerPage: getUserTablePreference("projectIdentityTable", PreferenceKey.PerPage, 20)
    });

    const handlePerPageChange = (newPerPage: number) => {
      setPerPage(newPerPage);
      setUserTablePreference("projectIdentityTable", PreferenceKey.PerPage, newPerPage);
    };

    const workspaceId = currentWorkspace?.id ?? "";

    const { data, isPending, isFetching } = useGetWorkspaceIdentityMemberships(
      {
        workspaceId: currentWorkspace?.id || "",
        offset,
        limit,
        orderDirection,
        orderBy,
        search: debouncedSearch
      },
      { placeholderData: (prevData) => prevData }
    );

    const { totalCount = 0 } = data ?? {};

    useResetPageHelper({
      totalCount,
      offset,
      setPage
    });

    const { mutateAsync: deleteMutateAsync } = useDeleteIdentityFromWorkspace();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "identity",
      "deleteIdentity",
      "upgradePlan"
    ] as const);

    const onRemoveIdentitySubmit = async (identityId: string) => {
      try {
        await deleteMutateAsync({
          identityId,
          workspaceId
        });

        createNotification({
          text: "Successfully removed identity from project",
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

    const handleSort = (column: ProjectIdentityOrderBy) => {
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
                <div className="ml-1 mt-[0.16rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  <span>Docs</span>
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.07rem] ml-1.5 text-[10px]"
                  />
                </div>
              </a>
            </div>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.Identity}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("identity")}
                  isDisabled={!isAllowed}
                >
                  Add Identity
                </Button>
              )}
            </ProjectPermissionCan>
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
                          orderBy === ProjectIdentityOrderBy.Name ? "" : "opacity-30"
                        }`}
                        ariaLabel="sort"
                        onClick={() => handleSort(ProjectIdentityOrderBy.Name)}
                      >
                        <FontAwesomeIcon
                          icon={
                            orderDirection === OrderByDirection.DESC &&
                            orderBy === ProjectIdentityOrderBy.Name
                              ? faArrowUp
                              : faArrowDown
                          }
                        />
                      </IconButton>
                    </div>
                  </Th>
                  <Th className="w-1/3">Role</Th>
                  <Th>Added on</Th>
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
                      identity: { id, name },
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
                              to: `${getProjectBaseURL(currentWorkspace.type)}/identities/$identityId` as const,
                              params: {
                                projectId: currentWorkspace.id,
                                identityId: id
                              }
                            });
                          }
                        }}
                        onClick={() =>
                          navigate({
                            to: `${getProjectBaseURL(currentWorkspace.type)}/identities/$identityId` as const,
                            params: {
                              projectId: currentWorkspace.id,
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
                                        <div className="capitalize">
                                          {formatProjectRoleName(role, customRoleName)}
                                        </div>
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
                                              <div>
                                                {formatProjectRoleName(role, customRoleName)}
                                              </div>
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
                              <DropdownMenuContent sideOffset={2} align="end">
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Delete}
                                  a={subject(ProjectPermissionSub.Identity, {
                                    identityId: id
                                  })}
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
                                      Remove Identity From Project
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                              </DropdownMenuContent>
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
          <IdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
          <DeleteActionModal
            isOpen={popUp.deleteIdentity.isOpen}
            title={`Are you sure you want to remove ${
              (popUp?.deleteIdentity?.data as { name: string })?.name || ""
            } from the project?`}
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
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Identity }
);
