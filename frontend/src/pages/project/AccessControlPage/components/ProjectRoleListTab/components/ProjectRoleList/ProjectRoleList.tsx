import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCopy,
  faEdit,
  faEllipsisV,
  faEye,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { ServerIcon, WrenchIcon } from "lucide-react";
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
  IconButton,
  Input,
  Pagination,
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
import { Badge, DocumentationLinkBadge } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
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

  const getClassName = (col: RolesOrderBy) => twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: RolesOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-x-2">
          <p className="text-xl font-medium text-mineshaft-100">Project Roles</p>
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls#project-level-access-controls" />
        </div>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Role}>
          {(isAllowed) => (
            <Button
              variant="outline_bg"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("role")}
              isDisabled={!isAllowed}
            >
              Add Project Role
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search project roles..."
        className="flex-1"
        containerClassName="mb-4"
      />
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={getClassName(RolesOrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(RolesOrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(RolesOrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Slug
                  <IconButton
                    variant="plain"
                    className={getClassName(RolesOrderBy.Slug)}
                    ariaLabel="sort"
                    onClick={() => handleSort(RolesOrderBy.Slug)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(RolesOrderBy.Slug)} />
                  </IconButton>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Type
                  <IconButton
                    variant="plain"
                    className={getClassName(RolesOrderBy.Type)}
                    ariaLabel="sort"
                    onClick={() => handleSort(RolesOrderBy.Type)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(RolesOrderBy.Type)} />
                  </IconButton>
                </div>
              </Th>
              <Th aria-label="actions" className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isRolesLoading && <TableSkeleton columns={4} innerKey="project-roles" />}
            {filteredRoles?.slice(offset, perPage * page).map((role) => {
              const { id, name, slug } = role;
              const isNonMutatable = Object.values(ProjectMembershipRole).includes(
                slug as ProjectMembershipRole
              );

              return (
                <Tr
                  key={`role-list-${id}`}
                  className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
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
                  <Td className="max-w-0 truncate">{name}</Td>
                  <Td className="max-w-0 truncate">{slug}</Td>
                  <Td>
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
                  </Td>
                  <Td>
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
                        <DropdownMenuContent className="min-w-48" sideOffset={2} align="end">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.Role}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                icon={<FontAwesomeIcon icon={isNonMutatable ? faEye : faEdit} />}
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
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
                                disabled={!isAllowed}
                              >
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
                                icon={<FontAwesomeIcon icon={faCopy} />}
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("duplicateRole", role);
                                }}
                                disabled={!isAllowed}
                              >
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
                                  icon={<FontAwesomeIcon icon={faTrash} />}
                                  className={twMerge(
                                    isAllowed
                                      ? "hover:bg-red-500! hover:text-white!"
                                      : "pointer-events-none cursor-not-allowed opacity-50",
                                    "transition-colors duration-100"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("deleteRole", role);
                                  }}
                                  disabled={!isAllowed}
                                >
                                  Delete Role
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Tooltip>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
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
        {!filteredRoles?.length && !isRolesLoading && (
          <EmptyState
            title={
              roles?.length
                ? "No project roles match search..."
                : "This project does not have any roles"
            }
            icon={roles?.length ? faSearch : undefined}
          />
        )}
      </TableContainer>
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
    </div>
  );
};
