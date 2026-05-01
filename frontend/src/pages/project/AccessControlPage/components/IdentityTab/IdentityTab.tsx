import { useCallback, useState } from "react";
import { subject } from "@casl/ability";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ClockAlertIcon,
  ClockIcon,
  FilterIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Modal, ModalContent, Spinner } from "@app/components/v2";
import { Blur } from "@app/components/v2/Blur";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  OrgIcon,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ProjectIcon,
  Skeleton,
  SubOrgIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
  useGetProjectRoles,
  useListProjectIdentityMemberships
} from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectIdentityOrderBy } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { ProjectIdentityModal } from "@app/pages/project/AccessControlPage/components/IdentityTab/components/ProjectIdentityModal";

import { ProjectLinkIdentityModal } from "./components/ProjectLinkIdentityModal";

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;

enum AddIdentityType {
  CreateNew,
  AssignExisting
}

export const IdentityTab = withProjectPermission(
  () => {
    const { currentProject, projectId } = useProject();
    const navigate = useNavigate();
    const { isSubOrganization, currentOrg } = useOrganization();

    const [addMachineIdentityType, setAddMachineIdentityType] = useState<AddIdentityType>(
      AddIdentityType.CreateNew
    );

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

    const { data: projectRoles } = useGetProjectRoles(projectId);

    const [filterRoles, setFilterRoles] = useState<string[]>([]);
    const isTableFiltered = Boolean(filterRoles.length);

    const handleRoleToggle = useCallback(
      (roleSlug: string) =>
        setFilterRoles((prev) => {
          const next = prev.includes(roleSlug)
            ? prev.filter((r) => r !== roleSlug)
            : [...prev, roleSlug];
          setPage(1);
          return next;
        }),
      []
    );

    const { data, isPending, isFetching } = useListProjectIdentityMemberships(
      {
        projectId,
        offset,
        limit,
        orderDirection,
        orderBy,
        search: debouncedSearch,
        roles: filterRoles
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
      <>
        <Card>
          <CardHeader>
            <CardTitle>
              Project Machine Identities
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/machine-identities" />
            </CardTitle>
            <CardDescription>Create and manage project machine identities</CardDescription>
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Create}
                a={ProjectPermissionSub.Identity}
              >
                {(isAllowed) => (
                  <Button
                    variant="project"
                    onClick={() => handlePopUpOpen("createIdentity")}
                    isDisabled={!isAllowed}
                  >
                    <PlusIcon />
                    Add Machine Identity to Project
                  </Button>
                )}
              </ProjectPermissionCan>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div>
              <div className="mb-4 flex gap-2">
                <InputGroup className="flex-1">
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search project machine identities by name..."
                  />
                </InputGroup>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton variant={isTableFiltered ? "project" : "outline"}>
                      <FilterIcon />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Filter by Project Role</DropdownMenuLabel>
                    {projectRoles?.map(({ id, slug, name }) => (
                      <DropdownMenuCheckboxItem
                        key={id}
                        checked={filterRoles.includes(slug)}
                        onClick={(e) => {
                          e.preventDefault();
                          handleRoleToggle(slug);
                        }}
                      >
                        {name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {!isPending && data && data.totalCount === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>
                      {debouncedSearch.trim().length > 0 || isTableFiltered
                        ? "No machine identities match search"
                        : "No machine identities have been added to this project"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {debouncedSearch.trim().length > 0 || isTableFiltered
                        ? "Adjust your search or filter criteria."
                        : "Add a machine identity to get started."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="w-1/3"
                          onClick={() => handleSort(ProjectIdentityOrderBy.Name)}
                        >
                          Name
                          <ChevronDownIcon
                            className={twMerge(
                              "transition-transform",
                              orderDirection === OrderByDirection.DESC &&
                                orderBy === ProjectIdentityOrderBy.Name &&
                                "rotate-180",
                              orderBy !== ProjectIdentityOrderBy.Name && "opacity-30"
                            )}
                          />
                        </TableHead>
                        <TableHead className="w-1/3">Project Role</TableHead>
                        <TableHead>Managed by</TableHead>
                        <TableHead className="w-5">
                          {isFetching ? <Spinner size="xs" /> : null}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isPending &&
                        Array.from({ length: 10 }).map((_, i) => (
                          <TableRow key={`skeleton-${i + 1}`}>
                            <TableCell>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-4" />
                            </TableCell>
                          </TableRow>
                        ))}
                      {!isPending &&
                        data &&
                        (data.identityMemberships ?? []).length > 0 &&
                        (data.identityMemberships ?? []).map((identityMember) => {
                          const {
                            identity: {
                              id,
                              name,
                              projectId: identityProjectId,
                              orgId: identityOrgId
                            },
                            roles
                          } = identityMember;
                          return (
                            <TableRow
                              className="group cursor-pointer"
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
                              <TableCell isTruncatable>{name}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
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
                                          new Date() >
                                          new Date(temporaryAccessEndTime || ("" as string));
                                        return (
                                          <Badge
                                            key={roleId}
                                            variant={isExpired ? "danger" : "neutral"}
                                          >
                                            <span className="capitalize">
                                              {formatProjectRoleName(role, customRoleName)}
                                            </span>
                                            {isTemporary && (
                                              <Tooltip>
                                                <TooltipTrigger>
                                                  <ClockIcon />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  {isExpired
                                                    ? "Access expired"
                                                    : "Temporary access"}
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                          </Badge>
                                        );
                                      }
                                    )}
                                  {roles.length > MAX_ROLES_TO_BE_SHOWN_IN_TABLE && (
                                    <Popover>
                                      <Tooltip>
                                        <TooltipTrigger className="flex h-4 items-center">
                                          <PopoverTrigger asChild>
                                            <Badge variant="neutral" asChild>
                                              <button
                                                type="button"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                +{roles.length - MAX_ROLES_TO_BE_SHOWN_IN_TABLE}
                                              </button>
                                            </Badge>
                                          </PopoverTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          Click to view additional roles
                                        </TooltipContent>
                                      </Tooltip>
                                      <PopoverContent
                                        side="right"
                                        className="flex w-auto max-w-sm flex-wrap gap-1.5"
                                        onClick={(e) => e.stopPropagation()}
                                      >
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
                                                <Badge
                                                  key={roleId}
                                                  className="z-10"
                                                  variant={isExpired ? "danger" : "neutral"}
                                                >
                                                  <span className="capitalize">
                                                    {formatProjectRoleName(role, customRoleName)}
                                                  </span>
                                                  {isTemporary && (
                                                    <Tooltip>
                                                      <TooltipTrigger tabIndex={-1}>
                                                        {isExpired ? (
                                                          <ClockAlertIcon />
                                                        ) : (
                                                          <ClockIcon />
                                                        )}
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        {isExpired
                                                          ? "Access expired"
                                                          : "Temporary access"}
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  )}
                                                </Badge>
                                              );
                                            }
                                          )}
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
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
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <IconButton
                                      variant="ghost"
                                      size="xs"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreHorizontalIcon />
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
                                          variant="danger"
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
                                          {identityProjectId ? <TrashIcon /> : <XIcon />}
                                          {identityProjectId
                                            ? "Delete Machine Identity"
                                            : "Remove From Project"}
                                        </DropdownMenuItem>
                                      )}
                                    </ProjectPermissionCan>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      {!isPending &&
                        data &&
                        data?.totalCount !== 0 &&
                        Array.from(Array(noAccessIdentityCount)).map((_e, i) => (
                          <TableRow key={`hid-identity-${i + 1}`}>
                            <TableCell>No Access</TableCell>
                            <TableCell colSpan={3}>
                              <Blur
                                className="w-min"
                                tooltipText="You do not have permission to view this machine identity."
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
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
                </>
              )}
            </div>
          </CardContent>
        </Card>
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
                  variant="outline"
                  onClick={() => {
                    setAddMachineIdentityType(AddIdentityType.CreateNew);
                  }}
                  size="xs"
                  className={twMerge(
                    "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
                    addMachineIdentityType === AddIdentityType.CreateNew
                      ? "bg-mineshaft-500"
                      : "bg-transparent"
                  )}
                >
                  Create New
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddMachineIdentityType(AddIdentityType.AssignExisting);
                  }}
                  size="xs"
                  className={twMerge(
                    "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
                    addMachineIdentityType === AddIdentityType.AssignExisting
                      ? "bg-mineshaft-500"
                      : "bg-transparent"
                  )}
                >
                  Assign Existing
                </Button>
              </div>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon size={16} className="text-mineshaft-400" />
                </TooltipTrigger>
                <TooltipContent side="right" align="start" className="max-w-sm">
                  <p className="mb-2 text-mineshaft-300">
                    You can add machine identities to your project in one of two ways:
                  </p>
                  <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                    <li className="text-mineshaft-200">
                      <strong className="font-medium text-mineshaft-100">Create New</strong> -
                      Create a dedicated machine identity managed at the project-level.
                      <p className="mt-2">
                        This method is recommended for autonomous teams that need to manage machine
                        identity authentication.
                      </p>
                    </li>
                    <li>
                      <strong className="font-medium text-mineshaft-100">Assign Existing</strong> -
                      Assign an existing machine identity from your organization.
                      <p className="mt-2">
                        This method is recommended for organizations that need to maintain
                        centralized control.
                      </p>
                    </li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </div>
            {addMachineIdentityType === AddIdentityType.CreateNew && (
              <ProjectIdentityModal
                onClose={() => {
                  handlePopUpClose("createIdentity");
                }}
              />
            )}
            {addMachineIdentityType === AddIdentityType.AssignExisting && (
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
      </>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Identity }
);
