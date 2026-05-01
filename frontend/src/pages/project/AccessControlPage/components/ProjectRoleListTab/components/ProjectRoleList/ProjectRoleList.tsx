import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
  TrashIcon,
  TriangleAlertIcon,
  WrenchIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  TableRow
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { isCustomProjectRole } from "@app/helpers/roles";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useDeleteProjectRole, useGetProjectRoles } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectMembershipRole, TProjectRole } from "@app/hooks/api/roles/types";
import { SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";
import { DuplicateProjectRoleModal } from "@app/pages/project/RoleDetailsBySlugPage/components/DuplicateProjectRoleModal";
import { RoleModal } from "@app/pages/project/RoleDetailsBySlugPage/components/RoleModal";

enum RolesOrderBy {
  Name = "name",
  Slug = "slug",
  Type = "type"
}

export const ProjectRoleList = () => {
  const navigate = useNavigate();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteRole",
    "duplicateRole"
  ] as const);
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data: roles, isPending: isRolesLoading } = useGetProjectRoles(projectId);

  const { mutateAsync: deleteRole } = useDeleteProjectRole();
  const { subscription } = useSubscription();

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TProjectRole;
    await deleteRole({
      projectId,
      id
    });
    createNotification({ type: "success", text: "Successfully removed the role" });
    handlePopUpClose("deleteRole");
  };

  const {
    orderDirection,
    toggleOrderDirection,
    orderBy,
    setOrderDirection,
    setOrderBy,
    search,
    setSearch,
    page,
    perPage,
    setPerPage,
    setPage,
    offset
  } = usePagination<RolesOrderBy>(RolesOrderBy.Type, {
    initPerPage: getUserTablePreference("projectRolesTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("projectRolesTable", PreferenceKey.PerPage, newPerPage);
  };

  const filteredRoles = useMemo(
    () =>
      roles
        ?.filter((role) => {
          const { slug, name } = role;

          const searchValue = search.trim().toLowerCase();

          return (
            name.toLowerCase().includes(searchValue) || slug.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [roleOne, roleTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case RolesOrderBy.Slug:
              return roleOne.slug.toLowerCase().localeCompare(roleTwo.slug.toLowerCase());
            case RolesOrderBy.Type: {
              const roleOneValue = isCustomProjectRole(roleOne.slug) ? -1 : 1;
              const roleTwoValue = isCustomProjectRole(roleTwo.slug) ? -1 : 1;

              return roleTwoValue - roleOneValue;
            }
            case RolesOrderBy.Name:
            default:
              return roleOne.name.toLowerCase().localeCompare(roleTwo.name.toLowerCase());
          }
        }) ?? [],
    [roles, orderDirection, search, orderBy]
  );

  useResetPageHelper({
    totalCount: filteredRoles.length,
    offset,
    setPage
  });

  const handleSort = (column: RolesOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const filteredRolesPage = filteredRoles.slice(offset, perPage * page);

  const isProPlan =
    Boolean(subscription) &&
    subscription.rbac &&
    [SubscriptionPlanTypes.Pro, SubscriptionPlanTypes.ProAnnual].includes(subscription.slug);

  const customRoles = filteredRoles.filter((role) => isCustomProjectRole(role.slug));

  return (
    <>
      {/* TODO(custom-roles): Remove this banner after 2026-06-01 when custom roles are removed from Pro plan */}
      {isProPlan && customRoles?.length > 0 && (
        <Alert variant="warning" className="mb-4">
          <TriangleAlertIcon />
          <AlertTitle>Custom roles are moving to Enterprise plans</AlertTitle>
          <AlertDescription>
            <div>
              Custom roles are part of the Infisical Enterprise plan, but were temporarily available
              to Pro users. Creation of new roles will be enforced starting June 1, 2026.
              <br />
              You can use{" "}
              <a
                href="https://infisical.com/docs/documentation/platform/access-controls/additional-privileges"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                additional privileges
              </a>{" "}
              as an alternative, or{" "}
              <a
                href="https://infisical.com/scheduledemo"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                contact sales
              </a>{" "}
              to upgrade and retain access to custom roles.
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Project Roles
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls#project-level-access-controls" />
          </CardTitle>
          <CardDescription>Create and manage project roles</CardDescription>
          <CardAction>
            <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Role}>
              {(isAllowed) => (
                <Button
                  variant="project"
                  onClick={() => handlePopUpOpen("role")}
                  isDisabled={!isAllowed}
                >
                  <PlusIcon />
                  Add Project Role
                </Button>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project roles..."
              />
            </InputGroup>
          </div>
          {!isRolesLoading && !filteredRoles?.length ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  {roles?.length
                    ? "No project roles match search"
                    : "This project does not have any roles"}
                </EmptyTitle>
                <EmptyDescription>
                  {roles?.length ? "Adjust your search criteria." : "Add a role to get started."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/3" onClick={() => handleSort(RolesOrderBy.Name)}>
                      Name
                      <ChevronDownIcon
                        className={twMerge(
                          "transition-transform",
                          orderDirection === OrderByDirection.DESC &&
                            orderBy === RolesOrderBy.Name &&
                            "rotate-180",
                          orderBy !== RolesOrderBy.Name && "opacity-30"
                        )}
                      />
                    </TableHead>
                    <TableHead className="w-1/3" onClick={() => handleSort(RolesOrderBy.Slug)}>
                      Slug
                      <ChevronDownIcon
                        className={twMerge(
                          "transition-transform",
                          orderDirection === OrderByDirection.DESC &&
                            orderBy === RolesOrderBy.Slug &&
                            "rotate-180",
                          orderBy !== RolesOrderBy.Slug && "opacity-30"
                        )}
                      />
                    </TableHead>
                    <TableHead onClick={() => handleSort(RolesOrderBy.Type)}>
                      Type
                      <ChevronDownIcon
                        className={twMerge(
                          "transition-transform",
                          orderDirection === OrderByDirection.DESC &&
                            orderBy === RolesOrderBy.Type &&
                            "rotate-180",
                          orderBy !== RolesOrderBy.Type && "opacity-30"
                        )}
                      />
                    </TableHead>
                    <TableHead className="w-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isRolesLoading &&
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
                  {filteredRolesPage.map((role) => {
                    const { id, name, slug } = role;
                    const isNonMutatable = Object.values(ProjectMembershipRole).includes(
                      slug as ProjectMembershipRole
                    );

                    return (
                      <TableRow
                        key={`role-list-${id}`}
                        className="cursor-pointer"
                        onClick={() =>
                          navigate({
                            to: `${getProjectBaseURL(currentProject.type)}/roles/$roleSlug`,
                            params: {
                              projectId: currentProject.id,
                              roleSlug: slug
                            }
                          })
                        }
                      >
                        <TableCell isTruncatable>{name}</TableCell>
                        <TableCell isTruncatable>{slug}</TableCell>
                        <TableCell>
                          <Badge variant="ghost">
                            {isCustomProjectRole(slug) ? (
                              <>
                                <WrenchIcon />
                                Custom
                              </>
                            ) : (
                              <>
                                <ServerIcon />
                                Platform
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
                            <DropdownMenuContent className="min-w-48" sideOffset={2} align="end">
                              <ProjectPermissionCan
                                I={ProjectPermissionActions.Edit}
                                a={ProjectPermissionSub.Role}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate({
                                        to: `${getProjectBaseURL(currentProject.type)}/roles/$roleSlug`,
                                        params: {
                                          projectId: currentProject.id,
                                          roleSlug: slug
                                        }
                                      });
                                    }}
                                    isDisabled={!isAllowed}
                                  >
                                    {isNonMutatable ? <EyeIcon /> : <PencilIcon />}
                                    {`${isNonMutatable ? "View" : "Edit"} Role`}
                                  </DropdownMenuItem>
                                )}
                              </ProjectPermissionCan>
                              <ProjectPermissionCan
                                I={ProjectPermissionActions.Create}
                                a={ProjectPermissionSub.Role}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("duplicateRole", role);
                                    }}
                                    isDisabled={!isAllowed}
                                  >
                                    <CopyIcon />
                                    Duplicate Role
                                  </DropdownMenuItem>
                                )}
                              </ProjectPermissionCan>
                              {!isNonMutatable && (
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Delete}
                                  a={ProjectPermissionSub.Role}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      variant="danger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("deleteRole", role);
                                      }}
                                      isDisabled={!isAllowed}
                                    >
                                      <TrashIcon />
                                      Delete Role
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {Boolean(filteredRoles?.length) && (
                <Pagination
                  count={filteredRoles!.length}
                  page={page}
                  perPage={perPage}
                  onChangePage={setPage}
                  onChangePerPage={handlePerPageChange}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
      <RoleModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteRole.isOpen}
        title={`Are you sure you want to delete ${
          (popUp?.deleteRole?.data as TProjectRole)?.name || " "
        } role?`}
        deleteKey={(popUp?.deleteRole?.data as TProjectRole)?.slug || ""}
        onClose={() => handlePopUpClose("deleteRole")}
        onDeleteApproved={handleRoleDelete}
      />
      <DuplicateProjectRoleModal
        isOpen={popUp.duplicateRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("duplicateRole", isOpen)}
        roleSlug={(popUp?.duplicateRole?.data as TProjectRole)?.slug}
      />
    </>
  );
};
