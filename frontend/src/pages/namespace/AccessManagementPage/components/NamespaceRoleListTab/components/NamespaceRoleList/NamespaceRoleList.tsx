import { useMemo } from "react";
import { faEye } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDown,
  faArrowUp,
  faCopy,
  faEdit,
  faEllipsisV,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { NamespacePermissionCan } from "@app/components/permissions";
import {
  Badge,
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
import { useNamespace } from "@app/context";
import {
  NamespacePermissionActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import { isCustomNamespaceRole } from "@app/helpers/roles";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { namespaceRolesQueryKeys, useDeleteNamespaceRole } from "@app/hooks/api/namespaceRoles";
import { TNamespaceRole } from "@app/hooks/api/namespaceRoles/types";
import { NamespaceRoleModal } from "@app/pages/namespace/RoleDetailsBySlugPage/components/NamespaceRoleModal";

enum RolesOrderBy {
  Name = "name",
  Slug = "slug",
  CreatedAt = "createdAt"
}

export const NamespaceRoleList = () => {
  const { namespaceName } = useNamespace();
  const navigate = useNavigate();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteRole",
    "duplicateRole"
  ] as const);

  const { data: rolesData, isPending: isRolesLoading } = useQuery(
    namespaceRolesQueryKeys.list({ namespaceName })
  );

  const { mutateAsync: deleteRole } = useDeleteNamespaceRole();

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TNamespaceRole;
    try {
      await deleteRole({
        namespaceName,
        roleId: id
      });
      createNotification({ type: "success", text: "Successfully removed the role" });
      handlePopUpClose("deleteRole");
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to delete role" });
    }
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
  } = usePagination<RolesOrderBy>(RolesOrderBy.CreatedAt, {
    initPerPage: getUserTablePreference("namespaceRolesTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("namespaceRolesTable", PreferenceKey.PerPage, newPerPage);
  };

  const filteredRoles = useMemo(
    () =>
      rolesData?.roles
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
            case RolesOrderBy.CreatedAt:
              return new Date(roleOne.createdAt).getTime() - new Date(roleTwo.createdAt).getTime();
            case RolesOrderBy.Name:
            default:
              return roleOne.name.toLowerCase().localeCompare(roleTwo.name.toLowerCase());
          }
        }) ?? [],
    [rolesData?.roles, orderDirection, search, orderBy]
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
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Namespace Roles</p>
        <NamespacePermissionCan
          I={NamespacePermissionActions.Create}
          a={NamespacePermissionSubjects.Role}
        >
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("role")}
              isDisabled={!isAllowed}
            >
              Add Role
            </Button>
          )}
        </NamespacePermissionCan>
      </div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search namespace roles..."
        className="flex-1"
        containerClassName="mb-4"
      />
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>
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
              <Th>
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
              <Th>Type</Th>
              <Th aria-label="actions" className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isRolesLoading && <TableSkeleton columns={5} innerKey="namespace-roles" />}
            {filteredRoles?.slice(offset, perPage * page).map((role) => {
              const { id, name, slug } = role;
              const isCustomRole = isCustomNamespaceRole(slug);

              return (
                <Tr
                  key={`role-list-${id}`}
                  className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                  onClick={() =>
                    navigate({
                      to: "/organization/namespaces/$namespaceName/roles/$roleSlug",
                      params: {
                        namespaceName,
                        roleSlug: slug
                      }
                    })
                  }
                >
                  <Td>{name}</Td>
                  <Td>{slug}</Td>
                  <Td>
                    <Badge className="w-min whitespace-nowrap bg-mineshaft-400/50 text-bunker-200">
                      {isCustomNamespaceRole(slug) ? "Custom" : "Default"}
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
                        <DropdownMenuContent className="min-w-[12rem]" sideOffset={2} align="end">
                          <NamespacePermissionCan
                            I={NamespacePermissionActions.Edit}
                            a={NamespacePermissionSubjects.Role}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                icon={<FontAwesomeIcon icon={isCustomRole ? faEdit : faEye} />}
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate({
                                    to: "/organization/namespaces/$namespaceName/roles/$roleSlug",
                                    params: {
                                      namespaceName,
                                      roleSlug: slug
                                    }
                                  });
                                }}
                                disabled={!isAllowed}
                              >
                                {`${!isCustomRole ? "View" : "Edit"} Role`}
                              </DropdownMenuItem>
                            )}
                          </NamespacePermissionCan>
                          <NamespacePermissionCan
                            I={NamespacePermissionActions.Create}
                            a={NamespacePermissionSubjects.Role}
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
                          </NamespacePermissionCan>
                          <NamespacePermissionCan
                            I={NamespacePermissionActions.Delete}
                            a={NamespacePermissionSubjects.Role}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                icon={<FontAwesomeIcon icon={faTrash} />}
                                className={twMerge(
                                  isAllowed
                                    ? "hover:!bg-red-500 hover:!text-white"
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
                          </NamespacePermissionCan>
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
              rolesData?.roles?.length
                ? "No namespace roles match search..."
                : "This namespace does not have any roles"
            }
            icon={rolesData?.roles?.length ? faSearch : undefined}
          />
        )}
      </TableContainer>
      <NamespaceRoleModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteRole.isOpen}
        title={`Are you sure you want to delete ${
          (popUp?.deleteRole?.data as TNamespaceRole)?.name || " "
        } role?`}
        deleteKey={(popUp?.deleteRole?.data as TNamespaceRole)?.slug || ""}
        onClose={() => handlePopUpClose("deleteRole")}
        onDeleteApproved={handleRoleDelete}
      />
    </div>
  );
};
