import { Dispatch, SetStateAction, useState } from "react";
import {
  faCheckCircle,
  faEllipsisV,
  faFilter,
  faMagnifyingGlass,
  faShieldHalved,
  faTrash,
  faUsers,
  faUserShield,
  faUserXmark,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AlertTriangleIcon, UserCogIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { Badge } from "@app/components/v3";
import { useSubscription, useUser } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp } from "@app/hooks";
import {
  useAdminBulkDeleteUsers,
  useAdminDeleteUser,
  useAdminGetUsers,
  useAdminGrantServerAdminAccess,
  useRemoveUserServerAdminAccess
} from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { User } from "@app/hooks/api/users/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const UserPanelTable = ({
  handlePopUpOpen,
  users,
  isPending,
  adminsOnly,
  searchUserFilter,
  setSearchUserFilter,
  setAdminsOnly,
  selectedUsers,
  setSelectedUsers,
  totalCount,
  page,
  perPage,
  setPage,
  handlePerPageChange
}: {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["removeUser", "upgradePlan", "upgradeToServerAdmin", "removeServerAdmin"]
    >,
    data?: {
      username: string;
      id: string;
      text?: string;
    }
  ) => void;
  isPending: boolean;
  users: User[] | undefined;
  adminsOnly: boolean;
  setAdminsOnly: (adminsOnly: boolean) => void;
  searchUserFilter: string;
  setSearchUserFilter: (filter: string) => void;
  selectedUsers: User[];
  setSelectedUsers: Dispatch<SetStateAction<User[]>>;
  totalCount: number;
  page: number;
  perPage: number;
  setPage: Dispatch<SetStateAction<number>>;
  handlePerPageChange: (newPerPage: number) => void;
}) => {
  const { subscription } = useSubscription();

  const isEmpty = !isPending && totalCount === 0;
  const isTableFiltered = Boolean(adminsOnly);

  const selectedUserIds = selectedUsers.map((user) => user.id);

  const isPageSelected = users?.length
    ? users.every((user) => selectedUserIds.includes(user.id))
    : false;

  // eslint-disable-next-line no-nested-ternary
  const isPageIndeterminate = isPageSelected
    ? false
    : users?.length
      ? users?.some((user) => selectedUserIds.includes(user.id))
      : false;

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={searchUserFilter}
          onChange={(e) => setSearchUserFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search users..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter Users"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="p-0">
            <DropdownMenuLabel>Filter By</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setAdminsOnly(!adminsOnly);
              }}
              icon={adminsOnly && <FontAwesomeIcon icon={faCheckCircle} />}
              iconPos="right"
            >
              <div className="flex items-center gap-x-2">
                <FontAwesomeIcon icon={faUserShield} className="text-yellow-700" />
                <span>Server Admins</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th className="w-5">
                  <Checkbox
                    id="member-page-select"
                    isChecked={isPageSelected || isPageIndeterminate}
                    isIndeterminate={isPageIndeterminate}
                    onCheckedChange={() => {
                      if (isPageSelected) {
                        setSelectedUsers((prev) =>
                          prev.filter((u) => !users?.find((user) => user.id === u.id))
                        );
                      } else {
                        setSelectedUsers((prev) => [
                          ...prev,
                          ...(users?.filter((u) => !prev.find((user) => user.id === u.id)) ?? [])
                        ]);
                      }
                    }}
                  />
                </Th>
                <Th className="w-5/12">Name</Th>
                <Th className="w-1/2">Username</Th>
                <Th className="w-2/12" />
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={4} innerKey="users" />}
              {!isPending &&
                users?.map((user) => {
                  const { username, email, firstName, lastName, id, superAdmin } = user;
                  const name = firstName || lastName ? `${firstName} ${lastName}` : null;

                  const isSelected = selectedUserIds.includes(id);
                  return (
                    <Tr key={`user-${id}`} className="w-full">
                      <Td>
                        <Checkbox
                          id={`select-user-${id}`}
                          isChecked={isSelected}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUsers((prev) =>
                              isSelected ? prev.filter((u) => u.id !== id) : [...prev, user]
                            );
                          }}
                        />
                      </Td>
                      <Td className="w-5/12 max-w-0">
                        <div className="flex items-center">
                          <p className="truncate">
                            {name ?? <span className="text-mineshaft-400">Not Set</span>}
                          </p>
                          {superAdmin && (
                            <Badge variant="info" className="ml-2">
                              <UserCogIcon />
                              Server Admin
                            </Badge>
                          )}
                        </div>
                      </Td>
                      <Td className="w-5/12 max-w-0">
                        <p className="truncate">{username || email}</p>
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("removeUser", { username, id });
                                }}
                                icon={<FontAwesomeIcon icon={faUserXmark} />}
                              >
                                Remove User
                              </DropdownMenuItem>
                              {!superAdmin && (
                                <DropdownMenuItem
                                  icon={<FontAwesomeIcon icon={faUserShield} />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      !subscription?.get(
                                        SubscriptionProductCategory.Platform,
                                        "instanceUserManagement"
                                      )
                                    ) {
                                      handlePopUpOpen("upgradePlan", {
                                        username,
                                        id,
                                        text: "Your current plan does not allow setting additional server admins. To unlock this feature, please upgrade to Infisical Pro plan."
                                      });
                                      return;
                                    }
                                    handlePopUpOpen("upgradeToServerAdmin", { username, id });
                                  }}
                                >
                                  Make User Server Admin
                                </DropdownMenuItem>
                              )}
                              {superAdmin && (
                                <DropdownMenuItem
                                  icon={
                                    <div className="relative">
                                      <FontAwesomeIcon icon={faShieldHalved} />
                                      <FontAwesomeIcon
                                        className="absolute -right-1 -bottom-[0.01rem]"
                                        size="2xs"
                                        icon={faXmark}
                                      />
                                    </div>
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      !subscription?.get(
                                        SubscriptionProductCategory.Platform,
                                        "instanceUserManagement"
                                      )
                                    ) {
                                      handlePopUpOpen("upgradePlan", {
                                        username,
                                        id,
                                        text: "Your current plan does not allow removing server admins. To unlock this feature, please upgrade to Infisical Pro plan."
                                      });
                                      return;
                                    }
                                    handlePopUpOpen("removeServerAdmin", { username, id });
                                  }}
                                >
                                  Remove Server Admin
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isPending && isEmpty && <EmptyState title="No users found" icon={faUsers} />}
        </TableContainer>
        {!isEmpty && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={handlePerPageChange}
          />
        )}
      </div>
    </>
  );
};

export const UserIdentitiesTable = () => {
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeUser",
    "upgradePlan",
    "upgradeToServerAdmin",
    "removeServerAdmin",
    "removeUsers"
  ] as const);

  const {
    user: { id: userId }
  } = useUser();

  const { mutateAsync: deleteUser } = useAdminDeleteUser();
  const { mutateAsync: deleteUsers } = useAdminBulkDeleteUsers();
  const { mutateAsync: grantAdminAccess } = useAdminGrantServerAdminAccess();
  const { mutateAsync: removeAdminAccess } = useRemoveUserServerAdminAccess();

  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [searchUserFilter, setSearchUserFilter] = useState("");
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [debouncedSearchTerm] = useDebounce(searchUserFilter, 500);

  const { offset, limit, setPage, perPage, page, setPerPage } = usePagination("", {
    initPerPage: getUserTablePreference("ResourceOverviewUsersTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("ResourceOverviewUsersTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isPending } = useAdminGetUsers({
    limit,
    offset,
    searchTerm: debouncedSearchTerm,
    adminsOnly
  });

  const { users, totalCount = 0 } = data ?? {};

  const handleRemoveUser = async () => {
    const { id } = popUp?.removeUser?.data as { id: string; username: string };

    await deleteUser(id);
    createNotification({
      type: "success",
      text: "Successfully deleted user"
    });

    handlePopUpClose("removeUser");
  };

  const handleGrantServerAdminAccess = async () => {
    const { id } = popUp?.upgradeToServerAdmin?.data as { id: string; username: string };

    await grantAdminAccess(id);
    createNotification({
      type: "success",
      text: "Successfully granted server admin access to user"
    });

    handlePopUpClose("upgradeToServerAdmin");
  };

  const handleRemoveServerAdminAccess = async () => {
    const { id } = popUp?.removeServerAdmin?.data as { id: string; username: string };

    await removeAdminAccess(id);
    createNotification({
      type: "success",
      text: "Successfully removed server admin access from user"
    });

    handlePopUpClose("removeServerAdmin");
  };

  const handleRemoveUsers = async () => {
    await deleteUsers(selectedUsers.map((user) => user.id));

    createNotification({
      text: "Successfully removed users",
      type: "success"
    });

    setSelectedUsers([]);
    handlePopUpClose("removeUsers");
  };

  return (
    <>
      <div
        className={twMerge(
          "h-0 shrink-0 overflow-hidden transition-all",
          selectedUsers.length > 0 && "h-16"
        )}
      >
        <div className="flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 px-4 py-2 text-bunker-300">
          <div className="mr-2 text-sm">{selectedUsers.length} Selected</div>
          <button
            type="button"
            className="mr-auto text-xs text-mineshaft-400 underline-offset-2 hover:text-mineshaft-200 hover:underline"
            onClick={() => setSelectedUsers([])}
          >
            Unselect All
          </button>
          <Button
            variant="outline_bg"
            colorSchema="danger"
            leftIcon={<FontAwesomeIcon icon={faTrash} />}
            className="ml-2"
            onClick={() => {
              if (!selectedUsers?.length) return;

              handlePopUpOpen("removeUsers");
            }}
            size="xs"
          >
            Delete
          </Button>
        </div>
      </div>
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xl font-medium text-mineshaft-100">User Identities</p>
            <p className="text-sm text-bunker-300">Manage user identities across your instance.</p>
          </div>
        </div>
        <UserPanelTable
          handlePopUpOpen={handlePopUpOpen}
          users={users}
          selectedUsers={selectedUsers}
          setSelectedUsers={setSelectedUsers}
          searchUserFilter={searchUserFilter}
          setSearchUserFilter={setSearchUserFilter}
          isPending={isPending}
          adminsOnly={adminsOnly}
          setAdminsOnly={setAdminsOnly}
          page={page}
          perPage={perPage}
          setPage={setPage}
          handlePerPageChange={handlePerPageChange}
          totalCount={totalCount}
        />
        <DeleteActionModal
          isOpen={popUp.removeUser.isOpen}
          deleteKey="remove"
          title={`Are you sure you want to delete User with username ${
            (popUp?.removeUser?.data as { id: string; username: string })?.username || ""
          }?`}
          onChange={(isOpen) => handlePopUpToggle("removeUser", isOpen)}
          onDeleteApproved={handleRemoveUser}
        />
        <DeleteActionModal
          isOpen={popUp.upgradeToServerAdmin.isOpen}
          title={`Are you sure you want to grant Server Admin permissions to ${
            (popUp?.upgradeToServerAdmin?.data as { id: string; username: string })?.username || ""
          }?`}
          subTitle=""
          onChange={(isOpen) => handlePopUpToggle("upgradeToServerAdmin", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={handleGrantServerAdminAccess}
          buttonText="Grant Access"
        />
        <DeleteActionModal
          isOpen={popUp.removeServerAdmin.isOpen}
          title={`Are you sure you want to remove Server Admin permissions from ${
            (popUp?.removeServerAdmin?.data as { id: string; username: string })?.username || ""
          }?`}
          subTitle=""
          onChange={(isOpen) => handlePopUpToggle("removeServerAdmin", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={handleRemoveServerAdminAccess}
          buttonText="Remove Access"
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={popUp.upgradePlan.data?.text}
        />
        <DeleteActionModal
          isOpen={popUp.removeUsers.isOpen}
          title="Are you sure you want to delete the following users?"
          onChange={(isOpen) => handlePopUpToggle("removeUsers", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() => handleRemoveUsers()}
          buttonText="Delete"
        >
          <div className="mt-4 text-sm text-mineshaft-400">
            The following users will be deleted:
          </div>
          <div className="mt-2 max-h-80 overflow-y-auto rounded-sm border border-mineshaft-600 bg-red/10 p-4 pl-8 text-sm text-red-200">
            <ul className="list-disc">
              {selectedUsers?.map((user) => {
                const email = user.email ?? user.username;
                return (
                  <li key={user.id}>
                    <div className="flex items-center gap-x-1">
                      <p>
                        {user.firstName || user.lastName ? (
                          <>
                            {`${`${user.firstName} ${user.lastName}`.trim()} `}(
                            <span className="break-all">{email}</span>)
                          </>
                        ) : (
                          <span className="break-all">{email}</span>
                        )}{" "}
                      </p>
                      {userId === user.id && (
                        <Tooltip content="Are you sure you want to remove yourself from this instance?">
                          <Badge variant="danger">
                            <AlertTriangleIcon />
                            Deleting Yourself
                          </Badge>
                        </Tooltip>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </DeleteActionModal>
      </div>
    </>
  );
};
