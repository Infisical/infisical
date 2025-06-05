import { useState } from "react";
import {
  faBuilding,
  faCircleQuestion,
  faEllipsis,
  faMagnifyingGlass
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Modal,
  ModalContent,
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
import { useDebounce, usePopUp } from "@app/hooks";
import {
  useAdminDeleteOrganization,
  useAdminDeleteOrganizationMembership,
  useAdminDeleteUser,
  useAdminGetOrganizations
} from "@app/hooks/api";
import { OrganizationWithProjects } from "@app/hooks/api/admin/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

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

  return (
    <div className="space-y-2">
      {organization?.members?.map((member) => (
        <div className="flex items-center justify-between gap-2 rounded-md bg-mineshaft-700 px-4 py-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-mineshaft-100">
                <div>
                  {member.user.firstName ? (
                    <div>
                      {member.user.firstName} {member.user.lastName}
                    </div>
                  ) : (
                    <p className="text-mineshaft-400">Not set</p>
                  )}
                </div>
                <div className="flex gap-2 opacity-80">
                  <div>{member.user.username || member.user.email}</div>
                  <Badge variant="primary">
                    <div className="flex items-center gap-1">
                      <span className="capitalize">{member.role.replace("-", " ")}</span>
                      {Boolean(member.roleId) && (
                        <Tooltip content="This member has a custom role assigned.">
                          <FontAwesomeIcon icon={faCircleQuestion} className="text-xs" />
                        </Tooltip>
                      )}
                    </div>
                  </Badge>
                </div>
              </p>
            </div>
          </div>
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <FontAwesomeIcon
                  icon={faEllipsis}
                  className="cursor-pointer text-sm text-mineshaft-400 transition-all hover:text-primary-500"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="p-1">
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
                  Remove From Organization
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handlePopUpOpen("deleteUser", { userId: member.user.id })}
                >
                  Delete User
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
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
    ["deleteOrganization", "viewMembers", "deleteOrganizationMembership", "deleteUser"]
  >;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["deleteOrganization", "viewMembers", "deleteOrganizationMembership", "deleteUser"]
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

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useAdminGetOrganizations({
      limit: 20,
      searchTerm: debouncedSearchTerm
    });

  const isEmpty = !isPending && !data?.pages?.[0].length;

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={searchOrganizationsFilter}
          onChange={(e) => setSearchOrganizationsFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search organizations..."
          className="flex-1"
        />
      </div>
      <div className="mt-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th className="w-5/12">Name</Th>
                <Th className="w-5/12">Members</Th>
                <Th className="w-5/12">Projects</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={4} innerKey="organizations" />}
              {!isPending &&
                data?.pages?.map((orgs) =>
                  orgs.map((org) => {
                    return (
                      <Tr key={`org-${org.id}`} className="w-full">
                        <Td className="w-5/12">
                          {org.name ? (
                            org.name
                          ) : (
                            <span className="text-mineshaft-400">Not set</span>
                          )}
                        </Td>
                        <Td className="w-5/12">
                          {org.members.length} {org.members.length === 1 ? "member" : "members"}
                          <Button
                            variant="outline_bg"
                            size="xs"
                            className="ml-2"
                            onClick={() => handlePopUpOpen("viewMembers", { organization: org })}
                          >
                            View Members
                          </Button>
                        </Td>
                        <Td className="w-5/12">
                          {org.projects.length} {org.projects.length === 1 ? "project" : "projects"}
                        </Td>
                        <Td>
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild className="rounded-lg">
                                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                                  <FontAwesomeIcon size="sm" icon={faEllipsis} />
                                </div>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="p-1">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("deleteOrganization", {
                                      orgId: org.id,
                                      orgName: org.name
                                    });
                                  }}
                                >
                                  Delete Organization
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })
                )}
            </TBody>
          </Table>
          {!isPending && isEmpty && <EmptyState title="No organizations found" icon={faBuilding} />}
        </TableContainer>
        {!isEmpty && (
          <Button
            className="mt-4 py-3 text-sm"
            isFullWidth
            variant="outline_bg"
            isLoading={isFetchingNextPage}
            isDisabled={isFetchingNextPage || !hasNextPage}
            onClick={() => fetchNextPage()}
          >
            {hasNextPage ? "Load More" : "End of list"}
          </Button>
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
    "viewMembers"
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
    </div>
  );
};
