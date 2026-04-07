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
  Badge,
  Button,
  DocumentationLinkBadge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  UnstableAlert,
  UnstableAlertDescription,
  UnstableAlertTitle,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
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
        <UnstableAlert variant="warning" className="mb-4">
          <TriangleAlertIcon />
          <UnstableAlertTitle>Custom roles are moving to Enterprise plans</UnstableAlertTitle>
          <UnstableAlertDescription>
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
          </UnstableAlertDescription>
        </UnstableAlert>
      )}

      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            Project Roles
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls#project-level-access-controls" />
          </UnstableCardTitle>
          <UnstableCardDescription>Create and manage project roles</UnstableCardDescription>
          <UnstableCardAction>
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
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
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
            <UnstableEmpty className="border">
              <UnstableEmptyHeader>
                <UnstableEmptyTitle>
                  {roles?.length
                    ? "No project roles match search"
                    : "This project does not have any roles"}
                </UnstableEmptyTitle>
                <UnstableEmptyDescription>
                  {roles?.length ? "Adjust your search criteria." : "Add a role to get started."}
                </UnstableEmptyDescription>
              </UnstableEmptyHeader>
            </UnstableEmpty>
          ) : (
            <>
              <UnstableTable>
                <UnstableTableHeader>
                  <UnstableTableRow>
                    <UnstableTableHead
                      className="w-1/3"
                      onClick={() => handleSort(RolesOrderBy.Name)}
                    >
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
                    </UnstableTableHead>
                    <UnstableTableHead
                      className="w-1/3"
                      onClick={() => handleSort(RolesOrderBy.Slug)}
                    >
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
                    </UnstableTableHead>
                    <UnstableTableHead onClick={() => handleSort(RolesOrderBy.Type)}>
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
                    </UnstableTableHead>
                    <UnstableTableHead className="w-5" />
                  </UnstableTableRow>
                </UnstableTableHeader>
                <UnstableTableBody>
                  {isRolesLoading &&
                    Array.from({ length: 10 }).map((_, i) => (
                      <UnstableTableRow key={`skeleton-${i + 1}`}>
                        <UnstableTableCell>
                          <Skeleton className="h-4 w-full" />
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <Skeleton className="h-4 w-full" />
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <Skeleton className="h-4 w-full" />
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <Skeleton className="h-4 w-4" />
                        </UnstableTableCell>
                      </UnstableTableRow>
                    ))}
                  {filteredRolesPage.map((role) => {
                    const { id, name, slug } = role;
                    const isNonMutatable = Object.values(ProjectMembershipRole).includes(
                      slug as ProjectMembershipRole
                    );

                    return (
                      <UnstableTableRow
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
                        <UnstableTableCell isTruncatable>{name}</UnstableTableCell>
                        <UnstableTableCell isTruncatable>{slug}</UnstableTableCell>
                        <UnstableTableCell>
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
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <UnstableDropdownMenu>
                            <UnstableDropdownMenuTrigger asChild>
                              <UnstableIconButton
                                variant="ghost"
                                size="xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontalIcon />
                              </UnstableIconButton>
                            </UnstableDropdownMenuTrigger>
                            <UnstableDropdownMenuContent
                              className="min-w-48"
                              sideOffset={2}
                              align="end"
                            >
                              <ProjectPermissionCan
                                I={ProjectPermissionActions.Edit}
                                a={ProjectPermissionSub.Role}
                              >
                                {(isAllowed) => (
                                  <UnstableDropdownMenuItem
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
                                  </UnstableDropdownMenuItem>
                                )}
                              </ProjectPermissionCan>
                              <ProjectPermissionCan
                                I={ProjectPermissionActions.Create}
                                a={ProjectPermissionSub.Role}
                              >
                                {(isAllowed) => (
                                  <UnstableDropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("duplicateRole", role);
                                    }}
                                    isDisabled={!isAllowed}
                                  >
                                    <CopyIcon />
                                    Duplicate Role
                                  </UnstableDropdownMenuItem>
                                )}
                              </ProjectPermissionCan>
                              {!isNonMutatable && (
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Delete}
                                  a={ProjectPermissionSub.Role}
                                >
                                  {(isAllowed) => (
                                    <UnstableDropdownMenuItem
                                      variant="danger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("deleteRole", role);
                                      }}
                                      isDisabled={!isAllowed}
                                    >
                                      <TrashIcon />
                                      Delete Role
                                    </UnstableDropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                              )}
                            </UnstableDropdownMenuContent>
                          </UnstableDropdownMenu>
                        </UnstableTableCell>
                      </UnstableTableRow>
                    );
                  })}
                </UnstableTableBody>
              </UnstableTable>
              {Boolean(filteredRoles?.length) && (
                <UnstablePagination
                  count={filteredRoles!.length}
                  page={page}
                  perPage={perPage}
                  onChangePage={setPage}
                  onChangePerPage={handlePerPageChange}
                />
              )}
            </>
          )}
        </UnstableCardContent>
      </UnstableCard>
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
