import { subject } from "@casl/ability";
import {
  faArrowDown,
  faArrowUp,
  faChevronDown,
  faCircleXmark,
  faClock,
  faEllipsisV,
  faLink,
  faMagnifyingGlass,
  faPlus,
  faServer
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
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
import {
  Badge,
  DocumentationLinkBadge,
  OrgIcon,
  ProjectIcon,
  SubOrgIcon
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { formatProjectRoleName } from "@app/helpers/roles";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { withProjectPermission } from "@app/hoc";
import { usePagination, useResetPageHelper } from "@app/hooks";
import {
  useDeleteProjectIdentity,
  useDeleteProjectIdentityMembership,
  useListProjectIdentityMemberships
} from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectIdentityOrderBy } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { ProjectIdentityModal } from "@app/pages/project/AccessControlPage/components/IdentityTab/components/ProjectIdentityModal";

import { ProjectLinkIdentityModal } from "./components/ProjectLinkIdentityModal";

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;

export const IdentityTab = withProjectPermission(
  () => {
    const { currentProject, projectId } = useProject();
    const navigate = useNavigate();
    const { isSubOrganization } = useOrganization();

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

    const { data, isPending, isFetching } = useListProjectIdentityMemberships(
      {
        projectId,
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

    const { mutateAsync: deleteMembershipMutateAsync } = useDeleteProjectIdentityMembership();
    const { mutateAsync: deleteProjectIdentity } = useDeleteProjectIdentity();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "createIdentity",
      "linkIdentity",
      "deleteIdentity",
      "upgradePlan",
      "addOptions"
    ] as const);

    const onRemoveIdentitySubmit = async (identityId: string, isProjectIdentity: boolean) => {
      try {
        if (isProjectIdentity) {
          await deleteProjectIdentity({
            identityId,
            projectId
          });

          createNotification({
            text: "Successfully deleted project identity",
            type: "success"
          });
        } else {
          await deleteMembershipMutateAsync({
            identityId,
            projectId
          });

          createNotification({
            text: "Successfully removed identity from project",
            type: "success"
          });
        }

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
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-x-2">
            <p className="text-xl font-medium text-mineshaft-100">Identities</p>
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/machine-identities" />
          </div>
          <div className="flex items-center">
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.Identity}
            >
              {(isAllowed) => (
                <Button
                  variant="outline_bg"
                  className="rounded-r-none"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("createIdentity")}
                  isDisabled={!isAllowed}
                >
                  Create Identity
                </Button>
              )}
            </ProjectPermissionCan>
            <DropdownMenu
              open={popUp.addOptions.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("addOptions", isOpen)}
            >
              <DropdownMenuTrigger>
                <Button variant="outline_bg" className="rounded-l-none border-l-mineshaft-800 px-3">
                  <FontAwesomeIcon icon={faChevronDown} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="p-1">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Create}
                  a={ProjectPermissionSub.Identity}
                >
                  {(isAllowed) => (
                    <Button
                      variant="outline_bg"
                      className="w-full"
                      isDisabled={!isAllowed}
                      leftIcon={<FontAwesomeIcon icon={faLink} />}
                      onClick={() => {
                        handlePopUpOpen("linkIdentity");
                        handlePopUpClose("addOptions");
                      }}
                    >
                      Assign Org Identity
                    </Button>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
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
                <Th>Managed by</Th>
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
                    identity: { id, name, projectId: identityProjectId },
                    roles
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
                            to: `${getProjectBaseURL(currentProject.type)}/identities/$identityId` as const,
                            params: {
                              projectId: currentProject.id,
                              identityId: id
                            }
                          });
                        }
                      }}
                      onClick={() =>
                        navigate({
                          to: `${getProjectBaseURL(currentProject.type)}/identities/$identityId` as const,
                          params: {
                            projectId: currentProject.id,
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
                                              isExpired ? "Timed role expired" : "Timed role access"
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
                                            <div>{formatProjectRoleName(role, customRoleName)}</div>
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
                      <Td>
                        <Badge variant="ghost">
                          {/* eslint-disable-next-line no-nested-ternary */}
                          {identityProjectId ? (
                            <>
                              <ProjectIcon />
                              Project
                            </>
                          ) : isSubOrganization ? (
                            <>
                              <SubOrgIcon />
                              Sub-Organization
                            </>
                          ) : (
                            <>
                              <OrgIcon />
                              Organization
                            </>
                          )}
                        </Badge>
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
                                        name,
                                        isProjectIdentity: Boolean(identityProjectId)
                                      });
                                    }}
                                  >
                                    {identityProjectId
                                      ? "Delete Project Identity"
                                      : "Remove Identity From Project"}
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
        <ProjectIdentityModal
          isOpen={popUp.createIdentity.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("createIdentity", isOpen)}
        />
        <ProjectLinkIdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        <DeleteActionModal
          isOpen={popUp.deleteIdentity.isOpen}
          title={`Are you sure you want to remove ${
            (popUp?.deleteIdentity?.data as { name: string })?.name || ""
          } from the project?`}
          onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() =>
            onRemoveIdentitySubmit(
              popUp?.deleteIdentity?.data?.identityId,
              popUp?.deleteIdentity?.data?.isProjectIdentity
            )
          }
        />
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Identity }
);
