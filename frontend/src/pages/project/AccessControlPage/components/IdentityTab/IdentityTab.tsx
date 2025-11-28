import { useState } from "react";
import { subject } from "@casl/ability";
import {
  faArrowDown,
  faArrowUp,
  faCircleXmark,
  faClock,
  faEllipsisV,
  faMagnifyingGlass,
  faPlus,
  faServer
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
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
import { Blur } from "@app/components/v2/Blur";
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
    const { isSubOrganization, currentOrg } = useOrganization();

    const [addMachineIdentityType, setAddMachineIdentityType] = useState<
      "create-new" | "assign-existing"
    >("create-new");

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
      "deleteIdentity",
      "upgradePlan",
      "addOptions"
    ] as const);

    const onRemoveIdentitySubmit = async (identityId: string, isProjectIdentity: boolean) => {
      if (isProjectIdentity) {
        await deleteProjectIdentity({
          identityId,
          projectId
        });

        createNotification({
          text: "Successfully deleted project machine identity",
          type: "success"
        });
      } else {
        await deleteMembershipMutateAsync({
          identityId,
          projectId
        });

        createNotification({
          text: "Successfully removed machine identity from project",
          type: "success"
        });
      }

      handlePopUpClose("deleteIdentity");
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

    const noAccessIdentityCount = Math.max(
      (page * perPage > totalCount ? totalCount % perPage : perPage) -
        (data?.identityMemberships?.length || 0),
      0
    );

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-x-2">
            <p className="text-xl font-medium text-mineshaft-100">Project Machine Identities</p>
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
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("createIdentity")}
                  isDisabled={!isAllowed}
                >
                  Add Machine Identity to Project
                </Button>
              )}
            </ProjectPermissionCan>
          </div>
        </div>
        <Input
          containerClassName="mb-4"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search project machine identities by name..."
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
                <Th className="w-1/3">Project Role</Th>
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
                    identity: { id, name, projectId: identityProjectId, orgId: identityOrgId },
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
                              orgId: currentOrg.id,
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
                            orgId: currentOrg.id,
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
                        <Badge
                          variant={
                            // eslint-disable-next-line no-nested-ternary
                            identityProjectId
                              ? "project"
                              : isSubOrganization && currentOrg.id === identityOrgId
                                ? "sub-org"
                                : "org"
                          }
                        >
                          {/* eslint-disable-next-line no-nested-ternary */}
                          {identityProjectId ? (
                            <>
                              <ProjectIcon />
                              Project
                            </>
                          ) : isSubOrganization && currentOrg.id === identityOrgId ? (
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
                                      ? "Delete Machine Identity"
                                      : "Remove From Project"}
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
              {!isPending &&
                data &&
                data?.totalCount !== 0 &&
                Array.from(Array(noAccessIdentityCount)).map((_e, i) => (
                  <Tr key={`hid-identity-${i + 1}`}>
                    <Td>No Access</Td>
                    <Td colSpan={3}>
                      <Blur
                        className="w-min"
                        tooltipText="You do not have permission to view this machine identity."
                      />
                    </Td>
                  </Tr>
                ))}
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
          {!isPending &&
            data &&
            data?.identityMemberships.length === 0 &&
            data?.totalCount === 0 && (
              <EmptyState
                title={
                  debouncedSearch.trim().length > 0
                    ? "No machine identities match search filter"
                    : "No machine identities have been added to this project"
                }
                icon={faServer}
              />
            )}
        </TableContainer>
        <Modal
          isOpen={popUp.createIdentity.isOpen}
          onOpenChange={(open) => {
            handlePopUpToggle("createIdentity", open);
          }}
        >
          <ModalContent
            bodyClassName="overflow-visible"
            title="Add Machine Identity to Project"
            subTitle="Create a new machine identity or assign an existing one"
          >
            <div className="mb-4 flex items-center justify-center gap-x-2">
              <div className="flex w-3/4 gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
                <Button
                  variant="outline_bg"
                  onClick={() => {
                    setAddMachineIdentityType("create-new");
                  }}
                  size="xs"
                  className={`${
                    addMachineIdentityType === "create-new" ? "bg-mineshaft-500" : "bg-transparent"
                  } min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600`}
                >
                  Create New
                </Button>
                <Button
                  variant="outline_bg"
                  onClick={() => {
                    setAddMachineIdentityType("assign-existing");
                  }}
                  size="xs"
                  className={`${
                    addMachineIdentityType === "assign-existing"
                      ? "bg-mineshaft-500"
                      : "bg-transparent"
                  } min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600`}
                >
                  Assign Existing
                </Button>
              </div>
              <Tooltip
                className="max-w-sm"
                position="right"
                align="start"
                content={
                  <>
                    <p className="mb-2 text-mineshaft-300">
                      You can add machine identities to your project in one of two ways:
                    </p>
                    <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                      <li className="text-mineshaft-200">
                        <strong className="font-medium text-mineshaft-100">Create New</strong> -
                        Create a dedicated machine identity managed at the project-level.
                        <p className="mt-2">
                          This method is recommended for autonomous teams that need to manage
                          machine identity authentication.
                        </p>
                      </li>
                      <li>
                        <strong className="font-medium text-mineshaft-100">Assign Existing</strong>{" "}
                        - Assign an existing machine identity from your organization.
                        <p className="mt-2">
                          This method is recommended for organizations that need to maintain
                          centralized control.
                        </p>
                      </li>
                    </ul>
                  </>
                }
              >
                <InfoIcon size={16} className="text-mineshaft-400" />
              </Tooltip>
            </div>
            {/* <p className="mb-4 text-sm text-bunker-300">
              {addType === "create-new" ? (
                <>

                </>
              ) : (
                <>

                </>
              )}
            </p> */}
            {/* {addType === WizardSteps.SelectAction && (
                <motion.div
                  key="select-type-step"
                  transition={{ duration: 0.1 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -30 }}
                >
                  <div
                    className="cursor-pointer rounded-md border border-mineshaft-600 p-4 transition-all hover:bg-mineshaft-700"
                    role="button"
                    tabIndex={0}
                    onClick={() => setAddType(WizardSteps.ProjectIdentity)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setAddType(WizardSteps.ProjectIdentity);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <PlusIcon size="1rem" />
                      <div>Create Machine Identity</div>
                    </div>
                    <div className="mt-2 text-xs text-mineshaft-300">
                      Create a new machine identity specifically for this project. This machine
                      identity will be managed at the project-level.
                    </div>
                  </div>
                  <div
                    className="mt-4 cursor-pointer rounded-md border border-mineshaft-600 p-4 transition-all hover:bg-mineshaft-700"
                    role="button"
                    tabIndex={0}
                    onClick={() => setAddType(WizardSteps.LinkIdentity)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setAddType(WizardSteps.LinkIdentity);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <LinkIcon size="1rem" />
                      <div>Assign Existing Machine Identity</div>
                    </div>
                    <div className="mt-2 text-xs text-mineshaft-300">
                      Assign an existing machine identity from your organization. The machine
                      identity will continue to be managed at its original scope.
                    </div>
                  </div>
                </motion.div>
              )} */}
            {addMachineIdentityType === "create-new" && (
              <ProjectIdentityModal
                onClose={() => {
                  handlePopUpClose("createIdentity");
                }}
              />
            )}
            {addMachineIdentityType === "assign-existing" && (
              <ProjectLinkIdentityModal handlePopUpToggle={handlePopUpToggle} />
            )}
          </ModalContent>
        </Modal>
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
