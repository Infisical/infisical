import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Building2Icon,
  CircleQuestionMarkIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  MailIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserCheckIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
  UserXIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
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
import { useUser } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  useAdminDeleteOrganization,
  useAdminDeleteOrganizationMembership,
  useAdminDeleteUser,
  useAdminGetOrganizations,
  useServerAdminAccessOrg,
  useServerAdminResendOrgInvite
} from "@app/hooks/api";
import { OrganizationWithProjects } from "@app/hooks/api/admin/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { OrgMembershipStatus } from "@app/hooks/api/organization/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { ConfirmActionDialog } from "@app/pages/admin/components/ConfirmActionDialog";
import { V3TableEmptyState, V3TableSkeleton } from "@app/pages/admin/components/V3TableHelpers";
import { AddOrganizationModal } from "@app/pages/admin/ResourceOverviewPage/components/AddOrganizationModal";

enum MembersOrderBy {
  Name = "firstName",
  Email = "email"
}

const ORG_MEMBERS_TABLE_LIMIT = 15;

const ViewMembersModalContent = ({
  popUp,
  handlePopUpOpen
}: {
  popUp: UsePopUpState<["viewMembers"]>;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteOrganizationMembership", "deleteUser"]>,
    data?: {
      username?: string;
      membershipId?: string;
      userId?: string;
      orgName?: string;
      orgId?: string;
      organization?: OrganizationWithProjects;
    }
  ) => void;
}) => {
  const organization = popUp.viewMembers?.data?.organization as OrganizationWithProjects;
  const [resendInviteId, setResendInviteId] = useState<string | null>(null);

  const members = organization?.members ?? [];

  const {
    search,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    orderBy,
    setOrderBy,
    setOrderDirection,
    toggleOrderDirection
  } = usePagination<MembersOrderBy>(MembersOrderBy.Name, {
    initPerPage: ORG_MEMBERS_TABLE_LIMIT
  });

  const filteredMembers = useMemo(
    () =>
      members
        ?.filter(
          ({ user: u }) =>
            u?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
            u?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
            u?.username?.toLowerCase().includes(search.toLowerCase()) ||
            u?.email?.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => {
          const [memberOne, memberTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          let valueOne: string | null;
          let valueTwo: string | null;

          switch (orderBy) {
            case MembersOrderBy.Email:
              valueOne = memberOne.user.email || memberOne.user.username;
              valueTwo = memberTwo.user.email || memberTwo.user.username;
              break;
            case MembersOrderBy.Name:
            default:
              valueOne = memberOne.user.firstName ?? memberOne.user.lastName;
              valueTwo = memberTwo.user.firstName ?? memberTwo.user.lastName;
          }

          if (!valueOne) return 1;
          if (!valueTwo) return -1;

          return valueOne.toLowerCase().localeCompare(valueTwo.toLowerCase());
        }),
    [members, search, orderBy, orderDirection]
  );

  const handleSort = (column: MembersOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  useResetPageHelper({
    totalCount: filteredMembers.length,
    offset,
    setPage
  });

  const resendOrgInvite = useServerAdminResendOrgInvite();

  const onResendInvite = async (membershipId: string) => {
    setResendInviteId(membershipId);
    try {
      await resendOrgInvite.mutateAsync({
        membershipId,
        organizationId: organization.id
      });

      createNotification({
        text: "Successfully resent org invitation",
        type: "success"
      });
    } finally {
      setResendInviteId(null);
    }
  };

  return (
    <>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search organization members"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members..."
        />
      </InputGroup>
      {Boolean(filteredMembers.length) && (
        <Table
          className="overflow-y-auto bg-container"
          containerClassName={twMerge(
            "mt-4 flex flex-1 flex-col bg-container",
            Boolean(filteredMembers.length) && "rounded-b-none"
          )}
        >
          <TableHeader className="sticky top-0 z-50">
            <TableRow>
              <TableHead className="w-1/3 border-none bg-container p-0">
                <div className="flex h-12 w-full items-center border-b border-border px-3 py-2.5">
                  Name
                  <IconButton
                    variant="ghost"
                    className={`ml-2 ${orderBy === MembersOrderBy.Name ? "" : "opacity-30"}`}
                    aria-label="sort"
                    onClick={() => handleSort(MembersOrderBy.Name)}
                  >
                    {orderDirection === OrderByDirection.DESC && orderBy === MembersOrderBy.Name ? (
                      <ArrowUpIcon />
                    ) : (
                      <ArrowDownIcon />
                    )}
                  </IconButton>
                </div>
              </TableHead>
              <TableHead className="w-1/3 border-none bg-container p-0">
                <div className="flex h-12 w-full items-center border-b border-border px-3 py-2.5">
                  Email
                  <IconButton
                    variant="ghost"
                    className={`ml-2 ${orderBy === MembersOrderBy.Email ? "" : "opacity-30"}`}
                    aria-label="sort"
                    onClick={() => handleSort(MembersOrderBy.Email)}
                  >
                    {orderDirection === OrderByDirection.DESC &&
                    orderBy === MembersOrderBy.Email ? (
                      <ArrowUpIcon />
                    ) : (
                      <ArrowDownIcon />
                    )}
                  </IconButton>
                </div>
              </TableHead>
              <TableHead className="w-1/4 border-none bg-container p-0">
                <div className="flex h-12 w-full items-center border-b border-border px-3 py-2.5">
                  Role
                </div>
              </TableHead>
              <TableHead className="w-5 border-none bg-container p-0">
                <div className="flex h-12 w-full items-center border-b border-border px-3 py-2.5" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.slice(offset, perPage * page).map((member) => {
              const { username, email, firstName, lastName, id } = member.user;
              const { role, status } = member;
              const name = firstName || lastName ? `${firstName} ${lastName}` : null;

              return (
                <TableRow key={`user-${id}`} className="w-full">
                  <TableCell className="max-w-0">
                    <div className="flex items-center">
                      <p className="truncate">
                        {name ?? <span className="text-muted">Not Set</span>}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <div className="flex items-center">
                      <p className="truncate">{username || email}</p>
                      {role === OrgMembershipRole.Admin &&
                        status !== OrgMembershipStatus.Accepted && (
                          <Button
                            isDisabled={resendOrgInvite.isPending}
                            className="ml-2 font-normal"
                            variant="outline"
                            size="xs"
                            isPending={
                              resendOrgInvite.isPending && resendInviteId === member.membershipId
                            }
                            onClick={(e) => {
                              onResendInvite(member.membershipId);
                              e.stopPropagation();
                            }}
                          >
                            <MailIcon />
                            Resend Invite
                          </Button>
                        )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-32">
                      {member.roleId ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge isTruncatable variant="neutral">
                              <span className="capitalize">{member.role.replace("-", " ")}</span>
                              <CircleQuestionMarkIcon />
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>This member has a custom role assigned.</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Badge isTruncatable variant="neutral">
                          <span className="capitalize">{member.role.replace("-", " ")}</span>
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton aria-label="Options" size="xs" variant="ghost">
                            <EllipsisVerticalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent sideOffset={2} align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              handlePopUpOpen("deleteOrganizationMembership", {
                                membershipId: member.membershipId,
                                orgId: organization.id,
                                username: member.user.username,
                                orgName: organization.name
                              })
                            }
                          >
                            <UserMinusIcon />
                            Remove From Organization
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handlePopUpOpen("deleteUser", {
                                userId: member.user.id
                              })
                            }
                          >
                            <UserXIcon />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {!filteredMembers.length && (
        <V3TableEmptyState
          title={
            members.length ? "No organization users match search..." : "No organization users found"
          }
          icon={UsersIcon}
        />
      )}
      {Boolean(filteredMembers.length) && (
        <Pagination
          className="rounded-b-md border border-t-0 border-border bg-container"
          count={filteredMembers.length}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={setPerPage}
          perPageList={[ORG_MEMBERS_TABLE_LIMIT]}
        />
      )}
    </>
  );
};

const ViewMembersModal = ({
  isOpen,
  onOpenChange,
  popUp,
  handlePopUpOpen
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  popUp: UsePopUpState<["viewMembers", "deleteOrganizationMembership", "deleteUser"]>;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteOrganizationMembership", "deleteUser"]>
  ) => void;
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>Organization Members</DialogTitle>
          <DialogDescription>View the members of the organization.</DialogDescription>
        </DialogHeader>
        <ViewMembersModalContent popUp={popUp} handlePopUpOpen={handlePopUpOpen} />
      </DialogContent>
    </Dialog>
  );
};

const OrganizationsPanelTable = ({
  popUp,
  handlePopUpOpen,
  handlePopUpToggle
}: {
  popUp: UsePopUpState<
    [
      "deleteOrganization",
      "viewMembers",
      "deleteOrganizationMembership",
      "deleteUser",
      "createOrganization"
    ]
  >;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      [
        "deleteOrganization",
        "viewMembers",
        "deleteOrganizationMembership",
        "deleteUser",
        "createOrganization"
      ]
    >,
    data?: {
      orgName?: string;
      orgId?: string;
      message?: string;
      organization?: OrganizationWithProjects;
    }
  ) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["deleteOrganization", "viewMembers"]>,
    isOpen?: boolean
  ) => void;
}) => {
  const [searchOrganizationsFilter, setSearchOrganizationsFilter] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchOrganizationsFilter, 500);

  const { user } = useUser();

  const navigate = useNavigate();

  const { offset, limit, setPage, perPage, page, setPerPage } = usePagination("", {
    initPerPage: getUserTablePreference("ResourceOverviewOrgsTable", PreferenceKey.PerPage, 10)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("ResourceOverviewOrgsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isPending } = useAdminGetOrganizations({
    limit,
    offset,
    searchTerm: debouncedSearchTerm
  });

  const { organizations, totalCount = 0 } = data ?? {};

  const isEmpty = !isPending && !totalCount;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { mutateAsync: accessOrganization } = useServerAdminAccessOrg();

  const handleAccessOrg = async (orgId: string) => {
    await accessOrganization(orgId);

    navigate({
      to: "/login/select-organization",
      search: {
        org_id: orgId
      }
    });

    createNotification({
      text: "Successfully joined organization",
      type: "success"
    });
  };

  return (
    <>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search organizations"
          value={searchOrganizationsFilter}
          onChange={(e) => setSearchOrganizationsFilter(e.target.value)}
          placeholder="Search organizations..."
        />
      </InputGroup>
      <div className="mt-4">
        {!isEmpty && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/2">Name</TableHead>
                <TableHead className="w-1/3">Members</TableHead>
                <TableHead className="w-1/3">Projects</TableHead>
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && <V3TableSkeleton columns={4} name="organizations" />}
              {!isPending &&
                organizations?.map((org) => {
                  const isMember = org.members.find((member) => member.user.id === user.id);

                  return (
                    <TableRow key={`org-${org.id}`} className="w-full">
                      <TableCell className="w-1/2 max-w-0">
                        <div className="flex items-center gap-x-1.5">
                          {org.name ? (
                            <p className="truncate">{org.name}</p>
                          ) : (
                            <span className="text-muted">Not Set</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="w-1/3">
                        <button
                          type="button"
                          onClick={() =>
                            handlePopUpOpen("viewMembers", {
                              organization: org
                            })
                          }
                          className="flex items-center hover:underline"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <EyeIcon className="mr-1.5 size-4 text-accent" />
                            </TooltipTrigger>
                            <TooltipContent>View Members</TooltipContent>
                          </Tooltip>
                          {org.members.length} {org.members.length === 1 ? "Member" : "Members"}
                          {!org.members.some(
                            (member) =>
                              member.role === OrgMembershipRole.Admin &&
                              member.status === OrgMembershipStatus.Accepted
                          ) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <TriangleAlertIcon className="ml-1.5 size-4 text-warning" />
                              </TooltipTrigger>
                              <TooltipContent>
                                No admins have accepted their invitations.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="w-1/3">
                        {org.projects.length} {org.projects.length === 1 ? "Project" : "Projects"}
                      </TableCell>
                      <TableCell variant="action">
                        <div className="flex items-center justify-end gap-1">
                          {isMember && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex size-7 items-center justify-center">
                                  <UserCheckIcon className="size-4 text-muted" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>You are a member of this organization</TooltipContent>
                            </Tooltip>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton aria-label="Options" size="xs" variant="ghost">
                                <EllipsisVerticalIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={2} align="end">
                              {!isMember && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAccessOrg(org.id);
                                  }}
                                >
                                  <UserPlusIcon />
                                  Join Organization
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteOrganization", {
                                    orgId: org.id,
                                    orgName: org.name
                                  });
                                }}
                                variant="danger"
                              >
                                <Trash2Icon />
                                Delete Organization
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
        {!isPending && isEmpty && (
          <V3TableEmptyState title="No organizations found" icon={Building2Icon} />
        )}
        {!isPending && totalCount > 0 && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={handlePerPageChange}
          />
        )}
      </div>
      <ViewMembersModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        isOpen={popUp.viewMembers.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("viewMembers", isOpen)}
      />
    </>
  );
};

export const OrganizationsTable = () => {
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "deleteOrganization",
    "deleteOrganizationMembership",
    "deleteUser",
    "viewMembers",
    "createOrganization"
  ] as const);

  const { mutateAsync: deleteOrganization } = useAdminDeleteOrganization();
  const { mutateAsync: deleteOrganizationMembership } = useAdminDeleteOrganizationMembership();
  const { mutateAsync: deleteUser } = useAdminDeleteUser();

  const handleDeleteOrganization = async () => {
    const { orgId } = popUp?.deleteOrganization?.data as { orgId: string };

    await deleteOrganization(orgId);
    createNotification({
      type: "success",
      text: "Successfully deleted organization"
    });

    handlePopUpClose("deleteOrganization");
  };

  const handleDeleteOrganizationMembership = async () => {
    const { orgId, membershipId } = popUp?.deleteOrganizationMembership?.data as {
      orgId: string;
      membershipId: string;
    };

    if (!orgId || !membershipId) {
      return;
    }

    await deleteOrganizationMembership({ organizationId: orgId, membershipId });
    createNotification({
      type: "success",
      text: "Successfully removed user from organization"
    });

    handlePopUpClose("viewMembers");
    handlePopUpClose("deleteOrganizationMembership");
  };

  const handleDeleteUser = async () => {
    const { userId } = popUp?.deleteUser?.data as { userId: string };

    if (!userId) {
      return;
    }

    await deleteUser(userId);
    createNotification({
      type: "success",
      text: "Successfully deleted user"
    });

    handlePopUpClose("viewMembers");
    handlePopUpClose("deleteUser");
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Organizations</CardTitle>
        <CardDescription>Manage, join and view organizations across your instance.</CardDescription>
        <CardAction>
          <Button variant="neutral" onClick={() => handlePopUpOpen("createOrganization")}>
            <PlusIcon />
            Add Organization
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <OrganizationsPanelTable
          popUp={popUp}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      </CardContent>
      <ConfirmActionDialog
        isOpen={popUp.deleteOrganization.isOpen}
        confirmationKey="delete"
        title={`Are you sure you want to delete organization ${
          (popUp?.deleteOrganization?.data as { orgName: string })?.orgName || ""
        }?`}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteOrganization", isOpen)}
        onConfirm={handleDeleteOrganization}
      />
      <ConfirmActionDialog
        isOpen={popUp.deleteOrganizationMembership.isOpen}
        confirmationKey="delete"
        title={`Are you sure you want to remove ${
          (popUp?.deleteOrganizationMembership?.data as { username: string })?.username || ""
        } from organization ${
          (popUp?.deleteOrganizationMembership?.data as { orgName: string })?.orgName || ""
        }?`}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteOrganizationMembership", isOpen)}
        description="The user will lose access to this organization. You can add them again later."
        onConfirm={handleDeleteOrganizationMembership}
      />
      <ConfirmActionDialog
        isOpen={popUp.deleteUser.isOpen}
        confirmationKey="delete"
        title={`Are you sure you want to delete user ${
          (popUp?.deleteUser?.data as { username: string })?.username || ""
        }?`}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteUser", isOpen)}
        onConfirm={handleDeleteUser}
      />
      <AddOrganizationModal
        isOpen={popUp.createOrganization.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createOrganization", isOpen)}
      />
    </Card>
  );
};
