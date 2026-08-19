import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  TriangleAlertIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  TableRow,
  type TableSortDirection
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
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole, TProjectRole } from "@app/hooks/api/roles/types";
import { SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";
import { DeleteProjectRoleDialog } from "@app/pages/project/RoleDetailsBySlugPage/components/DeleteProjectRoleDialog";
import { DuplicateProjectRoleModal } from "@app/pages/project/RoleDetailsBySlugPage/components/DuplicateProjectRoleModal";
import { RoleModal } from "@app/pages/project/RoleDetailsBySlugPage/components/RoleModal";

enum RolesOrderBy {
  Name = "name",
  Slug = "slug"
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
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;

  const { data: roles, isPending: isRolesLoading } = useGetProjectRoles(
    projectId,
    currentProject?.type
  );

  const { mutateAsync: deleteRole, isPending: isDeletingRole } = useDeleteProjectRole();
  const { subscription } = useSubscription();

  const handleRoleDelete = async () => {
    const { id, name } = popUp?.deleteRole?.data as TProjectRole;
    await deleteRole({
      projectId,
      projectType: currentProject?.type,
      id
    });
    createNotification({ type: "success", text: `Project role "${name}" deleted` });
    handlePopUpClose("deleteRole");
  };

  const [activeSort, setActiveSort] = useState<RolesOrderBy | null>(RolesOrderBy.Name);
  const {
    orderDirection,
    setOrderDirection,
    setOrderBy,
    search,
    setSearch,
    page,
    perPage,
    setPerPage,
    setPage,
    offset
  } = usePagination<RolesOrderBy>(RolesOrderBy.Name, {
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
          if (!activeSort) return 0;

          const [roleOne, roleTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (activeSort) {
            case RolesOrderBy.Slug:
              return roleOne.slug.toLowerCase().localeCompare(roleTwo.slug.toLowerCase());
            case RolesOrderBy.Name:
            default:
              return roleOne.name.toLowerCase().localeCompare(roleTwo.name.toLowerCase());
          }
        }) ?? [],
    [activeSort, roles, orderDirection, search]
  );

  const handleSort = (column: RolesOrderBy, direction: TableSortDirection) => {
    if (direction === "none") {
      setActiveSort(null);
      return;
    }

    setActiveSort(column);
    setOrderBy(column);
    setOrderDirection(direction === "ascending" ? OrderByDirection.ASC : OrderByDirection.DESC);
  };

  const getSortDirection = (column: RolesOrderBy): TableSortDirection => {
    if (activeSort !== column) return "none";
    return orderDirection === OrderByDirection.ASC ? "ascending" : "descending";
  };

  const customRoles = filteredRoles.filter((role) => isCustomProjectRole(role.slug));
  const defaultRoles = filteredRoles.filter((role) => !isCustomProjectRole(role.slug));
  const customRolesPage = customRoles.slice(offset, perPage * page);

  useResetPageHelper({
    totalCount: customRoles.length,
    offset,
    setPage
  });

  const isProPlan =
    Boolean(subscription) &&
    subscription.rbac &&
    [SubscriptionPlanTypes.Pro, SubscriptionPlanTypes.ProAnnual].includes(subscription.slug);

  const hasCustomRoles = roles?.some((role) => isCustomProjectRole(role.slug));

  const renderEmptyState = (title: string, description: string) => (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  const renderRoleTable = (tableRoles: TProjectRole[], skeletonCount = 4) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead
            className="w-1/2"
            sortDirection={getSortDirection(RolesOrderBy.Name)}
            onSortChange={(direction) => handleSort(RolesOrderBy.Name, direction)}
          >
            Name
            <ChevronDownIcon
              className={twMerge(
                "transition-transform",
                orderDirection === OrderByDirection.DESC &&
                  activeSort === RolesOrderBy.Name &&
                  "rotate-180",
                activeSort !== RolesOrderBy.Name && "opacity-30"
              )}
            />
          </TableHead>
          <TableHead
            className="w-1/2"
            sortDirection={getSortDirection(RolesOrderBy.Slug)}
            onSortChange={(direction) => handleSort(RolesOrderBy.Slug, direction)}
          >
            Slug
            <ChevronDownIcon
              className={twMerge(
                "transition-transform",
                orderDirection === OrderByDirection.DESC &&
                  activeSort === RolesOrderBy.Slug &&
                  "rotate-180",
                activeSort !== RolesOrderBy.Slug && "opacity-30"
              )}
            />
          </TableHead>
          <TableHead className="w-5">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isRolesLoading &&
          Array.from({ length: skeletonCount }).map((_, i) => (
            <TableRow key={`skeleton-${i + 1}`}>
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
        {tableRoles.map((role) => {
          const { id, name, slug } = role;
          const isNonMutatable = Object.values(ProjectMembershipRole).includes(
            slug as ProjectMembershipRole
          );

          const navigateToRole = () =>
            navigate({
              to: `${getProjectBaseURL(currentProject.type)}/roles/$roleSlug`,
              params: {
                projectId: currentProject.id,
                roleSlug: slug
              }
            });

          return (
            <TableRow
              key={`role-list-${id}`}
              tabIndex={0}
              aria-label={`View ${name}`}
              onClick={navigateToRole}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget || event.key !== "Enter") return;
                navigateToRole();
              }}
            >
              <TableCell isTruncatable>{name}</TableCell>
              <TableCell isTruncatable>{slug}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      aria-label={`Open actions for ${name}`}
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
                            navigateToRole();
                          }}
                          isDisabled={!isAllowed}
                        >
                          {isNonMutatable ? <EyeIcon /> : <PencilIcon />}
                          {`${isNonMutatable ? "View" : "Edit"} Role`}
                        </DropdownMenuItem>
                      )}
                    </ProjectPermissionCan>
                    {!isCertManager && (
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
                    )}
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
  );

  return (
    <>
      {/* TODO(custom-roles): Remove this banner after 2026-06-01 when custom roles are removed from Pro plan */}
      {isProPlan && hasCustomRoles && (
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
            {isCertManager ? "Roles" : "Project Roles"}
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls#project-level-access-controls" />
          </CardTitle>
          <CardDescription>
            {isCertManager
              ? "View built-in roles for Certificate Manager"
              : "Create and manage project roles"}
          </CardDescription>
          {!isCertManager && (
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Create}
                a={ProjectPermissionSub.Role}
              >
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
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div>
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isCertManager ? "Search roles..." : "Search project roles..."}
              />
            </InputGroup>
          </div>
          <section aria-labelledby="default-roles-heading" className="flex flex-col gap-3">
            <div>
              <h3 id="default-roles-heading" className="text-sm font-medium text-foreground">
                Default roles
              </h3>
              <p className="text-sm text-accent">Built-in roles managed by Infisical.</p>
            </div>
            {!isRolesLoading && !defaultRoles.length
              ? renderEmptyState(
                  search ? "No default roles match search" : "No default roles available",
                  search ? "Adjust your search criteria." : "Built-in roles will appear here."
                )
              : renderRoleTable(defaultRoles)}
          </section>
          {(!isCertManager || hasCustomRoles) && (
            <section aria-labelledby="custom-roles-heading" className="flex flex-col gap-3">
              <div>
                <h3 id="custom-roles-heading" className="text-sm font-medium text-foreground">
                  Custom roles
                </h3>
                <p className="text-sm text-accent">
                  Roles with granular permissions created for this project.
                </p>
              </div>
              {!isRolesLoading && !customRoles.length
                ? renderEmptyState(
                    search ? "No custom roles match search" : "No custom roles yet",
                    search ? "Adjust your search criteria." : "Add a project role to get started."
                  )
                : renderRoleTable(customRolesPage)}
              {Boolean(customRoles.length) && (
                <Pagination
                  count={customRoles.length}
                  page={page}
                  perPage={perPage}
                  onChangePage={setPage}
                  onChangePerPage={handlePerPageChange}
                />
              )}
            </section>
          )}
        </CardContent>
      </Card>
      <RoleModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteProjectRoleDialog
        isOpen={popUp.deleteRole.isOpen}
        roleName={(popUp?.deleteRole?.data as TProjectRole)?.name || "project role"}
        confirmationKey={(popUp?.deleteRole?.data as TProjectRole)?.slug || ""}
        isPending={isDeletingRole}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteRole", isOpen)}
        onConfirm={handleRoleDelete}
      />
      <DuplicateProjectRoleModal
        isOpen={popUp.duplicateRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("duplicateRole", isOpen)}
        roleSlug={(popUp?.duplicateRole?.data as TProjectRole)?.slug}
      />
    </>
  );
};
