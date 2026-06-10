import { useCallback, useState } from "react";
import { subject } from "@casl/ability";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  FilterIcon,
  InfoIcon,
  LockIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { AssumePrivilegesModal } from "@app/components/assume-privileges";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Spinner } from "@app/components/v2";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  IdentityRoleBadges,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  OrgIcon,
  Pagination,
  ProjectIcon,
  Skeleton,
  SubOrgIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { withProjectPermission } from "@app/hoc";
import { usePagination, useResetPageHelper } from "@app/hooks";
import {
  IdentityAuthMethod,
  identityAuthToNameMap,
  useDeleteProjectIdentity,
  useDeleteProjectIdentityMembership,
  useGetProjectRoles,
  useListProjectIdentityMemberships
} from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectIdentityOrderBy, ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { IdentityAuthMethodModal } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAuthMethodModal";
import { ProjectIdentityModal } from "@app/pages/project/AccessControlPage/components/IdentityTab/components/ProjectIdentityModal";
import { IdentityAuthMethodSheet } from "@app/views/IdentityAuthMethods";

import { ProjectLinkIdentityModal } from "./components/ProjectLinkIdentityModal";

enum AddIdentityType {
  CreateNew = "create-new",
  AssignExisting = "assign-existing"
}

export const IdentityTab = withProjectPermission(
  () => {
    const { currentProject, projectId } = useProject();
    const navigate = useNavigate();
    const { isSubOrganization, currentOrg } = useOrganization();
    const isCertManager = currentProject?.type === ProjectType.CertificateManager;
    const productLabel = isCertManager ? "Certificate Manager" : "Project";

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

    const { data: projectRoles } = useGetProjectRoles(projectId, currentProject?.type);

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

    const { data, isPending, isFetching, refetch } = useListProjectIdentityMemberships(
      {
        projectId,
        projectType: currentProject?.type,
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
      "addOptions",
      "identityAuthMethod",
      "assumePrivileges"
    ] as const);

    const [viewAuthMethodState, setViewAuthMethodState] = useState<{
      identityId: string;
      authMethod: IdentityAuthMethod;
    } | null>(null);

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
          projectId,
          projectType: currentProject?.type
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
              {isCertManager ? "Machine Identities" : `${productLabel} Machine Identities`}
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/machine-identities" />
            </CardTitle>
            <CardDescription>
              {`Create and manage ${productLabel.toLowerCase()} machine identities`}
            </CardDescription>
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
                    {isCertManager
                      ? "Add Machine Identity"
                      : `Add Machine Identity to ${productLabel}`}
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
                    placeholder={
                      isCertManager
                        ? "Search machine identities by name..."
                        : "Search project machine identities by name..."
                    }
                  />
                </InputGroup>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton variant={isTableFiltered ? "project" : "outline"}>
                      <FilterIcon />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                      {isCertManager ? "Filter by Role" : `Filter by ${productLabel} Role`}
                    </DropdownMenuLabel>
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
                      {/* eslint-disable-next-line no-nested-ternary */}
                      {debouncedSearch.trim().length > 0 || isTableFiltered
                        ? "No machine identities match search"
                        : isCertManager
                          ? "No machine identities have been added"
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
                          className="w-1/4"
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
                        <TableHead className="w-1/4">
                          {isCertManager ? "Role" : `${productLabel} Role`}
                        </TableHead>
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
                              orgId: identityOrgId,
                              authMethods,
                              activeLockoutAuthMethods
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
                                <IdentityRoleBadges roles={roles} />
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
                                      {productLabel}
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
                                <div className="flex items-center justify-end gap-2">
                                  {(activeLockoutAuthMethods?.length ?? 0) > 0 && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge isSquare variant="danger">
                                          <LockIcon />
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {`Locked out: ${(activeLockoutAuthMethods ?? [])
                                          .map((m) => identityAuthToNameMap[m])
                                          .join(", ")}`}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
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
                                      {identityProjectId && (
                                        <DropdownMenuSub>
                                          <DropdownMenuSubTrigger chevronOnLeft>
                                            Manage Auth Methods
                                          </DropdownMenuSubTrigger>
                                          <DropdownMenuSubContent>
                                            {(authMethods ?? []).map((method) => (
                                              <DropdownMenuItem
                                                key={method}
                                                onClick={(evt) => {
                                                  evt.stopPropagation();
                                                  evt.preventDefault();
                                                  setViewAuthMethodState({
                                                    identityId: id,
                                                    authMethod: method
                                                  });
                                                }}
                                              >
                                                {identityAuthToNameMap[method]}
                                                {activeLockoutAuthMethods?.includes(method) && (
                                                  <Badge
                                                    isSquare
                                                    variant="danger"
                                                    className="ml-auto"
                                                  >
                                                    <LockIcon className="size-3!" />
                                                  </Badge>
                                                )}
                                              </DropdownMenuItem>
                                            ))}
                                            <ProjectPermissionCan
                                              I={ProjectPermissionActions.Edit}
                                              a={subject(ProjectPermissionSub.Identity, {
                                                identityId: id
                                              })}
                                            >
                                              {(isAllowed) => (
                                                <DropdownMenuItem
                                                  isDisabled={!isAllowed}
                                                  onClick={(evt) => {
                                                    evt.stopPropagation();
                                                    evt.preventDefault();
                                                    handlePopUpOpen("identityAuthMethod", {
                                                      identityId: id,
                                                      name,
                                                      allAuthMethods: authMethods ?? []
                                                    });
                                                  }}
                                                >
                                                  <PlusIcon />
                                                  Add Auth Method
                                                </DropdownMenuItem>
                                              )}
                                            </ProjectPermissionCan>
                                          </DropdownMenuSubContent>
                                        </DropdownMenuSub>
                                      )}
                                      <ProjectPermissionCan
                                        I={ProjectPermissionIdentityActions.AssumePrivileges}
                                        a={subject(ProjectPermissionSub.Identity, {
                                          identityId: id
                                        })}
                                      >
                                        {(isAllowed) => (
                                          <Tooltip>
                                            <TooltipTrigger className="block w-full">
                                              <DropdownMenuItem
                                                isDisabled={!isAllowed}
                                                onClick={(evt) => {
                                                  evt.stopPropagation();
                                                  evt.preventDefault();
                                                  handlePopUpOpen("assumePrivileges", {
                                                    identityId: id
                                                  });
                                                }}
                                              >
                                                Assume Privileges
                                                {isAllowed && <InfoIcon className="text-muted" />}
                                              </DropdownMenuItem>
                                            </TooltipTrigger>
                                            {isAllowed && (
                                              <TooltipContent className="max-w-80" side="left">
                                                Assume the privileges of this machine identity,
                                                allowing you to replicate their access behavior.
                                              </TooltipContent>
                                            )}
                                          </Tooltip>
                                        )}
                                      </ProjectPermissionCan>
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
                                            {/* eslint-disable-next-line no-nested-ternary */}
                                            {identityProjectId
                                              ? "Delete Machine Identity"
                                              : isCertManager
                                                ? "Remove From Certificate Manager"
                                                : "Remove From Project"}
                                          </DropdownMenuItem>
                                        )}
                                      </ProjectPermissionCan>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
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
                            <TableCell colSpan={4}>
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
        <Dialog
          open={popUp.createIdentity.isOpen}
          onOpenChange={(open) => {
            handlePopUpToggle("createIdentity", open);
            if (!open) {
              setAddMachineIdentityType(AddIdentityType.CreateNew);
            }
          }}
        >
          <DialogContent className="max-w-xl overflow-visible">
            <DialogHeader>
              <DialogTitle>{`Add Machine Identity to ${productLabel}`}</DialogTitle>
              <DialogDescription>
                Create a new machine identity or assign an existing one
              </DialogDescription>
            </DialogHeader>
            <div className="mx-auto flex items-center gap-2">
              <Tabs
                value={addMachineIdentityType}
                onValueChange={(value) => setAddMachineIdentityType(value as AddIdentityType)}
              >
                <TabsList>
                  <TabsTrigger value={AddIdentityType.CreateNew}>Create New</TabsTrigger>
                  <TabsTrigger value={AddIdentityType.AssignExisting}>Assign Existing</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon size={16} className="text-mineshaft-400" />
                </TooltipTrigger>
                <TooltipContent side="right" align="start" className="max-w-sm">
                  <p className="mb-2 text-mineshaft-300">
                    You can add machine identities to your{" "}
                    {isCertManager ? "Certificate Manager" : "project"} in one of two ways:
                  </p>
                  <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                    <li className="text-mineshaft-200">
                      <strong className="font-medium text-mineshaft-100">Create New</strong> -
                      Create a dedicated machine identity managed at the{" "}
                      {isCertManager ? "Certificate Manager-level" : "project-level"}.
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
          </DialogContent>
        </Dialog>
        <DeleteActionModal
          isOpen={popUp.deleteIdentity.isOpen}
          title={`Are you sure you want to remove ${
            (popUp?.deleteIdentity?.data as { name: string })?.name || ""
          } from the ${productLabel.toLowerCase()}?`}
          onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() =>
            onRemoveIdentitySubmit(
              popUp?.deleteIdentity?.data?.identityId,
              popUp?.deleteIdentity?.data?.isProjectIdentity
            )
          }
        />
        <IdentityAuthMethodModal
          popUp={popUp}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
        {viewAuthMethodState &&
          (() => {
            const viewedIdentity = data?.identityMemberships?.find(
              (m) => m.identity.id === viewAuthMethodState.identityId
            )?.identity;
            if (!viewedIdentity) return null;
            return (
              <IdentityAuthMethodSheet
                open
                onOpenChange={(open) => {
                  if (!open) setViewAuthMethodState(null);
                }}
                identityId={viewAuthMethodState.identityId}
                identityName={viewedIdentity.name}
                authMethod={viewAuthMethodState.authMethod}
                allAuthMethods={viewedIdentity.authMethods ?? []}
                isLockedOut={
                  viewedIdentity.activeLockoutAuthMethods?.includes(
                    viewAuthMethodState.authMethod
                  ) ?? false
                }
                onMutated={refetch}
              />
            );
          })()}
        <AssumePrivilegesModal
          isOpen={popUp.assumePrivileges.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
          actorType={ActorType.IDENTITY}
          actorId={(popUp.assumePrivileges.data as { identityId: string })?.identityId}
        />
      </>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Identity }
);
