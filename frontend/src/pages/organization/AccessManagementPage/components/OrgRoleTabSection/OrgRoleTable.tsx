import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  IdCardIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
  TrashIcon,
  WrenchIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Badge,
  Button,
  DocumentationLinkBadge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
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
        text: "Your current plan does not include access to set a custom default organization role. To unlock this feature, please upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
      return;
    }

    await updateOrg({
      orgId,
      defaultMembershipRoleSlug
    });
    createNotification({ type: "success", text: "Successfully updated default membership role" });
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

  const filteredRolesPage = filteredRoles.slice(offset, perPage * page);

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            {isSubOrganization ? "Sub-" : ""}Organization Roles
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/organization#roles-and-access-control" />
          </UnstableCardTitle>
          <UnstableCardDescription>
            Create and manage {isSubOrganization ? "sub-" : ""}organization roles
          </UnstableCardDescription>
          <UnstableCardAction>
            <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Role}>
              {(isAllowed) => (
                <Button
                  variant={isSubOrganization ? "sub-org" : "org"}
                  onClick={() => {
                    handlePopUpOpen("role");
                  }}
                  isDisabled={!isAllowed}
                >
                  <PlusIcon />
                  Add {isSubOrganization ? "Sub-" : ""}Organization Role
                </Button>
              )}
            </OrgPermissionCan>
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
          <div>
            <div className="mb-4">
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${isSubOrganization ? "sub-" : ""}organization roles...`}
                />
              </InputGroup>
            </div>
            {!isRolesLoading && !filteredRoles?.length ? (
              <UnstableEmpty className="border">
                <UnstableEmptyHeader>
                  <UnstableEmptyTitle>
                    {roles?.length
                      ? `No ${isSubOrganization ? "sub-" : ""}organization roles match search`
                      : "This organization does not have any roles"}
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
                      Array.from({ length: perPage }).map((_, i) => (
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
                      const isNonMutatable = ["owner", "admin", "member", "no-access"].includes(
                        slug
                      );
                      const isDefaultOrgRole = isCustomOrgRole(slug)
                        ? id === currentOrg?.defaultMembershipRole
                        : slug === currentOrg?.defaultMembershipRole;
                      return (
                        <UnstableTableRow
                          key={`role-list-${id}`}
                          className="cursor-pointer"
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
                          <UnstableTableCell isTruncatable>
                            <div className="flex gap-x-1.5">
                              <p className="truncate">{name}</p>
                              {isDefaultOrgRole && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="info">Default</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Members joining your organization will be assigned the {name}{" "}
                                    role unless otherwise specified.
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </UnstableTableCell>
                          <UnstableTableCell isTruncatable>{slug}</UnstableTableCell>
                          <UnstableTableCell>
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
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Edit}
                                  a={OrgPermissionSubjects.Role}
                                >
                                  {(isAllowed) => (
                                    <UnstableDropdownMenuItem
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
                                    >
                                      {isNonMutatable ? <EyeIcon /> : <PencilIcon />}
                                      {`${isNonMutatable ? "View" : "Edit"} Role`}
                                    </UnstableDropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Create}
                                  a={OrgPermissionSubjects.Role}
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
                                </OrgPermissionCan>
                                {!isDefaultOrgRole && (
                                  <OrgPermissionCan
                                    I={OrgPermissionActions.Edit}
                                    a={OrgPermissionSubjects.Settings}
                                  >
                                    {(isAllowed) => (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div>
                                            <UnstableDropdownMenuItem
                                              isDisabled={!isAllowed || isSubOrganization}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleSetRoleAsDefault(slug);
                                              }}
                                            >
                                              <IdCardIcon />
                                              Set as Default Role
                                            </UnstableDropdownMenuItem>
                                          </div>
                                        </TooltipTrigger>
                                        {isSubOrganization && (
                                          <TooltipContent side="left">
                                            This action cannot be performed from sub-organizations.
                                          </TooltipContent>
                                        )}
                                      </Tooltip>
                                    )}
                                  </OrgPermissionCan>
                                )}
                                {!isNonMutatable && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <OrgPermissionCan
                                          I={OrgPermissionActions.Delete}
                                          a={OrgPermissionSubjects.Role}
                                        >
                                          {(isAllowed) => (
                                            <UnstableDropdownMenuItem
                                              variant="danger"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handlePopUpOpen("deleteRole", role);
                                              }}
                                              isDisabled={!isAllowed || isDefaultOrgRole}
                                            >
                                              <TrashIcon />
                                              Delete Role
                                            </UnstableDropdownMenuItem>
                                          )}
                                        </OrgPermissionCan>
                                      </div>
                                    </TooltipTrigger>
                                    {isDefaultOrgRole && (
                                      <TooltipContent side="left">
                                        Cannot delete default organization membership role.
                                        Re-assign default to allow deletion.
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
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
          </div>
        </UnstableCardContent>
      </UnstableCard>
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
        isEnterpriseFeature={popUp.upgradePlan?.data?.isEnterpriseFeature}
      />
      <DuplicateOrgRoleModal
        isOpen={popUp.duplicateRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("duplicateRole", isOpen)}
        roleId={(popUp?.duplicateRole?.data as TOrgRole)?.id}
      />
    </>
  );
};
