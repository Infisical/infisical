import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faBuilding,
  faEllipsisV,
  faEnvelope,
  faEye,
  faMagnifyingGlass,
  faPlus,
  faTrash,
  faUserCheck,
  faUserMinus,
  faUserPlus,
  faUsers,
  faUserXmark,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { CircleQuestionMarkIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
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
  Modal,
  ModalContent,
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
import { Badge } from "@app/components/v3";
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
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search members..."
      />
      <TableContainer
        className={twMerge(
          "mt-4 flex flex-1 flex-col border border-mineshaft-500 bg-mineshaft-700",
          Boolean(filteredMembers.length) && "rounded-b-none"
        )}
      >
        <Table className="overflow-y-auto bg-mineshaft-700">
          <THead className="sticky top-0 z-50">
            <Tr>
              <Th className="w-1/3 border-none bg-mineshaft-700 p-0">
                <div className="flex h-12 w-full items-center border-b-2 border-mineshaft-500 px-3 py-2.5">
                  Name
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === MembersOrderBy.Name ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(MembersOrderBy.Name)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC && orderBy === MembersOrderBy.Name
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3 border-none bg-mineshaft-700 p-0">
                <div className="flex h-12 w-full items-center border-b-2 border-mineshaft-500 px-3 py-2.5">
                  Email
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === MembersOrderBy.Email ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(MembersOrderBy.Email)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC && orderBy === MembersOrderBy.Email
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/4 border-none bg-mineshaft-700 p-0">
                <div className="flex h-12 w-full items-center border-b-2 border-mineshaft-500 px-3 py-2.5">
                  Role
                </div>
              </Th>
              <Th className="w-5 border-none bg-mineshaft-700 p-0">
                <div className="flex h-12 w-full items-center border-b-2 border-mineshaft-500 px-3 py-2.5" />
              </Th>
            </Tr>
          </THead>
          <TBody>
            {filteredMembers.slice(offset, perPage * page).map((member) => {
              const { username, email, firstName, lastName, id } = member.user;
              const { role, status } = member;
              const name = firstName || lastName ? `${firstName} ${lastName}` : null;

              return (
                <Tr key={`user-${id}`} className="w-full">
                  <Td className="max-w-0">
                    <div className="flex items-center">
                      <p className="truncate">
                        {name ?? <span className="text-mineshaft-400">Not Set</span>}
                      </p>
                    </div>
                  </Td>
                  <Td className="max-w-0">
                    <div className="flex items-center">
                      <p className="truncate">{username || email}</p>
                      {role === OrgMembershipRole.Admin &&
                        status !== OrgMembershipStatus.Accepted && (
                          <Button
                            isDisabled={resendOrgInvite.isPending}
                            className="ml-2 h-7 border-mineshaft-600 bg-mineshaft-800/50 font-normal"
                            colorSchema="primary"
                            variant="outline_bg"
                            size="xs"
                            isLoading={
                              resendOrgInvite.isPending && resendInviteId === member.membershipId
                            }
                            leftIcon={<FontAwesomeIcon icon={faEnvelope} />}
                            onClick={(e) => {
                              onResendInvite(member.membershipId);
                              e.stopPropagation();
                            }}
                          >
                            Resend Invite
                          </Button>
                        )}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex max-w-32">
                      <Tooltip
                        content={member.roleId ? "This member has a custom role assigned." : ""}
                      >
                        <Badge isTruncatable variant="neutral">
                          <span className="capitalize">{member.role.replace("-", " ")}</span>
                          {Boolean(member.roleId) && <CircleQuestionMarkIcon />}
                        </Badge>
                      </Tooltip>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex justify-end">
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
                        <DropdownMenuContent sideOffset={2} align="end">
                          <DropdownMenuItem
                            icon={<FontAwesomeIcon icon={faUserMinus} />}
                            onClick={() =>
                              handlePopUpOpen("deleteOrganizationMembership", {
                                membershipId: member.membershipId,
                                orgId: organization.id,
                                username: member.user.username,
                                orgName: organization.name
                              })
                            }
                          >
                            Remove From Organization
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            icon={<FontAwesomeIcon icon={faUserXmark} />}
                            onClick={() =>
                              handlePopUpOpen("deleteUser", { userId: member.user.id })
                            }
                          >
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
        {!filteredMembers.length && (
          <EmptyState
            className="my-auto bg-mineshaft-700"
            title={
              members.length
                ? "No organization users match search..."
                : "No organization users found"
            }
            icon={faUsers}
          />
        )}
      </TableContainer>
      {Boolean(filteredMembers.length) && (
        <Pagination
          className="rounded-b-md border border-t-0 bg-mineshaft-700"
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
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        title="Organization Members"
        subTitle="View the members of the organization."
        className="h-full max-w-4xl"
        bodyClassName="flex flex-col h-full"
      >
        <ViewMembersModalContent popUp={popUp} handlePopUpOpen={handlePopUpOpen} />
      </ModalContent>
    </Modal>
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
      <Input
        value={searchOrganizationsFilter}
        onChange={(e) => setSearchOrganizationsFilter(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search organizations..."
        className="flex-1"
      />
      <div className="mt-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th className="w-1/2">Name</Th>
                <Th className="w-1/3">Members</Th>
                <Th className="w-1/3">Projects</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={4} innerKey="organizations" />}
              {!isPending &&
                organizations?.map((org) => {
                  const isMember = org.members.find((member) => member.user.id === user.id);

                  return (
                    <Tr key={`org-${org.id}`} className="w-full">
                      <Td className="w-1/2 max-w-0">
                        <div className="flex items-center gap-x-1.5">
                          {org.name ? (
                            <p className="truncate">{org.name}</p>
                          ) : (
                            <span className="text-mineshaft-400">Not Set</span>
                          )}
                        </div>
                      </Td>
                      <Td className="w-1/3">
                        <button
                          type="button"
                          onClick={() => handlePopUpOpen("viewMembers", { organization: org })}
                          className="flex items-center hover:underline"
                        >
                          <Tooltip className="text-center" content="View Members">
                            <FontAwesomeIcon
                              icon={faEye}
                              className="mr-1.5 text-mineshaft-300"
                              size="sm"
                            />
                          </Tooltip>
                          {org.members.length} {org.members.length === 1 ? "Member" : "Members"}
                          {!org.members.some(
                            (member) =>
                              member.role === OrgMembershipRole.Admin &&
                              member.status === OrgMembershipStatus.Accepted
                          ) && (
                            <Tooltip content="No admins have accepted their invitations.">
                              <div className="ml-1.5">
                                <FontAwesomeIcon className="text-yellow" icon={faWarning} />
                              </div>
                            </Tooltip>
                          )}
                        </button>
                      </Td>
                      <Td className="w-1/3">
                        {org.projects.length} {org.projects.length === 1 ? "Project" : "Projects"}
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-x-1">
                          {isMember && (
                            <Tooltip
                              className="text-center"
                              content="You are a member of this organization"
                            >
                              <div>
                                <FontAwesomeIcon
                                  className="text-mineshaft-400"
                                  icon={faUserCheck}
                                  size="sm"
                                />
                              </div>
                            </Tooltip>
                          )}
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
                            <DropdownMenuContent sideOffset={2} align="end">
                              {!isMember && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAccessOrg(org.id);
                                  }}
                                  icon={<FontAwesomeIcon icon={faUserPlus} />}
                                >
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
                                icon={<FontAwesomeIcon icon={faTrash} />}
                              >
                                Delete Organization
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isPending && isEmpty && <EmptyState title="No organizations found" icon={faBuilding} />}
        </TableContainer>
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
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xl font-medium text-mineshaft-100">Organizations</p>
          <p className="text-sm text-bunker-300">
            Manage, join and view organizations across your instance.
          </p>
        </div>
        <Button
          colorSchema="secondary"
          onClick={() => handlePopUpOpen("createOrganization")}
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
        >
          Add Organization
        </Button>
      </div>
      <OrganizationsPanelTable
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteOrganization.isOpen}
        deleteKey="delete"
        title={`Are you sure you want to delete organization ${
          (popUp?.deleteOrganization?.data as { orgName: string })?.orgName || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteOrganization", isOpen)}
        onDeleteApproved={handleDeleteOrganization}
      />
      <DeleteActionModal
        isOpen={popUp.deleteOrganizationMembership.isOpen}
        deleteKey="delete"
        title={`Are you sure you want to remove ${
          (popUp?.deleteOrganizationMembership?.data as { username: string })?.username || ""
        } from organization ${
          (popUp?.deleteOrganizationMembership?.data as { orgName: string })?.orgName || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteOrganizationMembership", isOpen)}
        onDeleteApproved={handleDeleteOrganizationMembership}
      />
      <DeleteActionModal
        isOpen={popUp.deleteUser.isOpen}
        deleteKey="delete"
        title={`Are you sure you want to delete user ${
          (popUp?.deleteUser?.data as { username: string })?.username || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteUser", isOpen)}
        onDeleteApproved={handleDeleteUser}
      />
      <AddOrganizationModal
        isOpen={popUp.createOrganization.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createOrganization", isOpen)}
      />
    </div>
  );
};
