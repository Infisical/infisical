import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCopy,
  faEdit,
  faEllipsisV,
  faEye,
  faIdBadge,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { ServerIcon, WrenchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
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
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { isCustomOrgRole } from "@app/helpers/roles";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useDeleteOrgRole, useGetOrgRoles, useUpdateOrg } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { TOrgRole } from "@app/hooks/api/roles/types";
import { DuplicateOrgRoleModal } from "@app/pages/organization/RoleByIDPage/components/DuplicateOrgRoleModal";
import { RoleModal } from "@app/pages/organization/RoleByIDPage/components/RoleModal";

enum RolesOrderBy {
  Name = "name",
  Slug = "slug",
  Type = "type"
}

export const OrgRoleTable = () => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "role",
    "deleteRole",
    "duplicateRole",
    "upgradePlan"
  ] as const);

  const { data: roles, isPending: isRolesLoading } = useGetOrgRoles(orgId);
  const { mutateAsync: deleteRole } = useDeleteOrgRole();
  const { mutateAsync: updateOrg } = useUpdateOrg();
  const { subscription } = useSubscription();

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TOrgRole;
    await deleteRole({
      orgId,
      id
    });
    createNotification({ type: "success", text: "Successfully removed the role" });
    handlePopUpClose("deleteRole");
  };

  const handleSetRoleAsDefault = async (defaultMembershipRoleSlug: string) => {
    const isCustomRole = isCustomOrgRole(defaultMembershipRoleSlug);

    if (isCustomRole && subscription && !subscription?.rbac) {
      handlePopUpOpen("upgradePlan", {
        text: "Your current plan does not include access to set a custom default organization role. To unlock this feature, please upgrade to Infisical Pro plan."
      });
      return;
    }

    await updateOrg({
      orgId,
      defaultMembershipRoleSlug
    });
    createNotification({ type: "success", text: "Successfully updated default membership role" });
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
    initPerPage: getUserTablePreference("orgRolesTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("orgRolesTable", PreferenceKey.PerPage, newPerPage);
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
              const roleOneValue = isCustomOrgRole(roleOne.slug) ? -1 : 1;
              const roleTwoValue = isCustomOrgRole(roleTwo.slug) ? -1 : 1;

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
          <p className="text-xl font-medium text-mineshaft-100">
            {isSubOrganization ? "Sub-" : ""}Organization Roles
          </p>
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/organization#roles-and-access-control" />
        </div>
        <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Role}>
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => {
                handlePopUpOpen("role");
              }}
              isDisabled={!isAllowed}
            >
              Add Role
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search roles..."
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
            {isRolesLoading && <TableSkeleton columns={4} innerKey="org-roles" />}
            {filteredRoles?.slice(offset, perPage * page).map((role) => {
              const { id, name, slug } = role;
              const isNonMutatable = ["owner", "admin", "member", "no-access"].includes(slug);
              const isDefaultOrgRole = isCustomOrgRole(slug)
                ? id === currentOrg?.defaultMembershipRole
                : slug === currentOrg?.defaultMembershipRole;
              return (
                <Tr
                  key={`role-list-${id}`}
                  className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                  onClick={() =>
                    navigate({
                      to: "/organizations/$orgId/roles/$roleId",
                      params: {
                        roleId: id,
                        orgId
                      }
                    })
                  }
                >
                  <Td className="max-w-md">
                    <div className="flex gap-x-1.5">
                      <p className="overflow-hidden text-ellipsis whitespace-nowrap">{name}</p>
                      {isDefaultOrgRole && (
                        <Tooltip
                          content={`Members joining your organization will be assigned the ${name} role unless otherwise specified.`}
                        >
                          <Badge variant="info">Default</Badge>
                        </Tooltip>
                      )}
                    </div>
                  </Td>
                  <Td className="max-w-md overflow-hidden text-ellipsis whitespace-nowrap">
                    {slug}
                  </Td>
                  <Td>
                    <Badge variant="ghost">
                      {isCustomOrgRole(slug) ? (
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
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.Role}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate({
                                  to: "/organizations/$orgId/roles/$roleId",
                                  params: {
                                    roleId: id,
                                    orgId
                                  }
                                });
                              }}
                              isDisabled={!isAllowed}
                              icon={<FontAwesomeIcon icon={isNonMutatable ? faEye : faEdit} />}
                            >
                              {`${isNonMutatable ? "View" : "Edit"} Role`}
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                        <OrgPermissionCan
                          I={OrgPermissionActions.Create}
                          a={OrgPermissionSubjects.Role}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("duplicateRole", role);
                              }}
                              isDisabled={!isAllowed}
                              icon={<FontAwesomeIcon icon={faCopy} />}
                            >
                              Duplicate Role
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                        {!isDefaultOrgRole && (
                          <OrgPermissionCan
                            I={OrgPermissionActions.Edit}
                            a={OrgPermissionSubjects.Settings}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetRoleAsDefault(slug);
                                }}
                                icon={<FontAwesomeIcon icon={faIdBadge} />}
                              >
                                Set as Default Role
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                        )}
                        {!isNonMutatable && (
                          <Tooltip
                            position="left"
                            content={
                              isDefaultOrgRole
                                ? "Cannot delete default organization membership role. Re-assign default to allow deletion."
                                : ""
                            }
                          >
                            <div>
                              <OrgPermissionCan
                                I={OrgPermissionActions.Delete}
                                a={OrgPermissionSubjects.Role}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("deleteRole", role);
                                    }}
                                    icon={<FontAwesomeIcon icon={faTrash} />}
                                    isDisabled={!isAllowed || isDefaultOrgRole}
                                  >
                                    Delete Role
                                  </DropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                            </div>
                          </Tooltip>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                ? "No roles match search..."
                : "This organization does not have any roles"
            }
            icon={roles?.length ? faSearch : undefined}
          />
        )}
      </TableContainer>
      <RoleModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteRole.isOpen}
        title={`Are you sure you want to delete ${
          (popUp?.deleteRole?.data as TOrgRole)?.name || " "
        } role?`}
        onChange={(isOpen) => handlePopUpToggle("deleteRole", isOpen)}
        deleteKey={(popUp?.deleteRole?.data as TOrgRole)?.slug || ""}
        onClose={() => handlePopUpClose("deleteRole")}
        onDeleteApproved={handleRoleDelete}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan?.data?.text}
      />
      <DuplicateOrgRoleModal
        isOpen={popUp.duplicateRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("duplicateRole", isOpen)}
        roleId={(popUp?.duplicateRole?.data as TOrgRole)?.id}
      />
    </div>
  );
};
