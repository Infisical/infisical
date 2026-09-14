import { Dispatch, SetStateAction, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  ListFilterIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  Trash2Icon,
  UserCogIcon,
  UserRoundXIcon,
  UsersIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  SelectedActionBar,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
import { User } from "@app/hooks/api/users/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { AdminDeleteActionDialog } from "@app/pages/admin/components/AdminDeleteActionDialog";
import {
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/pages/admin/components/AdminTable";

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
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search users"
            value={searchUserFilter}
            onChange={(e) => setSearchUserFilter(e.target.value)}
            placeholder="Search users..."
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Filter Users"
              variant="outline"
              className={twMerge("px-3", isTableFiltered && "border-admin/50 text-admin")}
            >
              <ListFilterIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="p-0">
            <DropdownMenuLabel>Filter By</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setAdminsOnly(!adminsOnly);
              }}
            >
              <ShieldCheckIcon className="text-admin" />
              <span>Server Admins</span>
              {adminsOnly && <CheckIcon className="ml-auto" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4">
        {isEmpty ? (
          <EmptyState className="border" title="No user identities found" icon={UsersIcon} />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Th className="w-5">
                    <Checkbox
                      aria-label="Select all users on this page"
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
                    const name =
                      firstName || lastName ? `${firstName ?? ""} ${lastName ?? ""}`.trim() : null;

                    const isSelected = selectedUserIds.includes(id);
                    return (
                      <Tr key={`user-${id}`} className="w-full">
                        <Td>
                          <Checkbox
                            aria-label={`Select user ${username || email}`}
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
                              {name ?? <span className="text-muted">Not Set</span>}
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
                                <IconButton aria-label="Options" size="xs" variant="ghost">
                                  <EllipsisVerticalIcon />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent sideOffset={2} align="end">
                                <DropdownMenuItem
                                  variant="danger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("removeUser", {
                                      username,
                                      id
                                    });
                                  }}
                                >
                                  <UserRoundXIcon />
                                  Remove User
                                </DropdownMenuItem>
                                {!superAdmin && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!subscription?.instanceUserManagement) {
                                        handlePopUpOpen("upgradePlan", {
                                          username,
                                          id,
                                          text: "Your current plan does not allow setting additional server admins. To unlock this feature, please upgrade to Infisical Pro plan."
                                        });
                                        return;
                                      }
                                      handlePopUpOpen("upgradeToServerAdmin", {
                                        username,
                                        id
                                      });
                                    }}
                                  >
                                    <ShieldCheckIcon />
                                    Make User Server Admin
                                  </DropdownMenuItem>
                                )}
                                {superAdmin && (
                                  <DropdownMenuItem
                                    variant="danger"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!subscription?.instanceUserManagement) {
                                        handlePopUpOpen("upgradePlan", {
                                          username,
                                          id,
                                          text: "Your current plan does not allow removing server admins. To unlock this feature, please upgrade to Infisical Pro plan."
                                        });
                                        return;
                                      }
                                      handlePopUpOpen("removeServerAdmin", {
                                        username,
                                        id
                                      });
                                    }}
                                  >
                                    <ShieldXIcon />
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
          </TableContainer>
        )}
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
      text: "User deleted"
    });

    handlePopUpClose("removeUser");
  };

  const handleGrantServerAdminAccess = async () => {
    const { id } = popUp?.upgradeToServerAdmin?.data as {
      id: string;
      username: string;
    };

    await grantAdminAccess(id);
    createNotification({
      type: "success",
      text: "Server admin access granted"
    });

    handlePopUpClose("upgradeToServerAdmin");
  };

  const handleRemoveServerAdminAccess = async () => {
    const { id } = popUp?.removeServerAdmin?.data as {
      id: string;
      username: string;
    };

    await removeAdminAccess(id);
    createNotification({
      type: "success",
      text: "Server admin access removed"
    });

    handlePopUpClose("removeServerAdmin");
  };

  const handleRemoveUsers = async () => {
    await deleteUsers(selectedUsers.map((user) => user.id));

    createNotification({
      text: "Selected users deleted",
      type: "success"
    });

    setSelectedUsers([]);
    handlePopUpClose("removeUsers");
  };

  return (
    <>
      <SelectedActionBar
        selectedCount={selectedUsers.length}
        onClearSelection={() => setSelectedUsers([])}
      >
        <Button
          variant="danger"
          onClick={() => {
            if (!selectedUsers?.length) return;

            handlePopUpOpen("removeUsers");
          }}
          size="xs"
        >
          <Trash2Icon />
          Delete
        </Button>
      </SelectedActionBar>
      <Card className="mb-6 gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle>User Identities</CardTitle>
          <CardDescription>Manage user identities across your instance.</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6">
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
        </CardContent>
        <AdminDeleteActionDialog
          isOpen={popUp.removeUser.isOpen}
          confirmationKey="remove"
          title={`Delete "${
            (popUp?.removeUser?.data as { id: string; username: string })?.username || "user"
          }"`}
          onChange={(isOpen) => handlePopUpToggle("removeUser", isOpen)}
          onConfirm={handleRemoveUser}
        />
        <AdminDeleteActionDialog
          isOpen={popUp.upgradeToServerAdmin.isOpen}
          title={`Grant Server Admin Access to "${
            (
              popUp?.upgradeToServerAdmin?.data as {
                id: string;
                username: string;
              }
            )?.username || "user"
          }"`}
          description="This user will be able to manage configuration and resources across the instance."
          onChange={(isOpen) => handlePopUpToggle("upgradeToServerAdmin", isOpen)}
          confirmationKey="confirm"
          onConfirm={handleGrantServerAdminAccess}
          confirmButtonText="Grant Access"
          confirmButtonVariant="warning"
        />
        <AdminDeleteActionDialog
          isOpen={popUp.removeServerAdmin.isOpen}
          title={`Remove Server Admin Access from "${
            (popUp?.removeServerAdmin?.data as { id: string; username: string })?.username || "user"
          }"`}
          description="This user will no longer be able to manage the instance."
          onChange={(isOpen) => handlePopUpToggle("removeServerAdmin", isOpen)}
          confirmationKey="confirm"
          onConfirm={handleRemoveServerAdminAccess}
          confirmButtonText="Remove Access"
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={popUp.upgradePlan.data?.text}
        />
        <AdminDeleteActionDialog
          isOpen={popUp.removeUsers.isOpen}
          title="Delete Selected Users"
          onChange={(isOpen) => handlePopUpToggle("removeUsers", isOpen)}
          confirmationKey="confirm"
          onConfirm={() => handleRemoveUsers()}
          confirmButtonText="Delete"
        >
          <div className="mt-4 text-sm text-accent">The following users will be deleted:</div>
          <div className="mt-2 max-h-80 overflow-y-auto rounded-sm border border-danger/20 bg-danger/10 p-4 pl-8 text-sm text-danger">
            <ul className="list-disc">
              {selectedUsers?.map((user) => {
                const email = user.email ?? user.username;
                return (
                  <li key={user.id}>
                    <div className="flex items-center gap-x-1">
                      <p>
                        {user.firstName || user.lastName ? (
                          <>
                            {`${`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()} `}(
                            <span className="break-all">{email}</span>)
                          </>
                        ) : (
                          <span className="break-all">{email}</span>
                        )}{" "}
                      </p>
                      {userId === user.id && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="danger">
                              <AlertTriangleIcon />
                              Deleting Yourself
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Are you sure you want to remove yourself from this instance?
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </AdminDeleteActionDialog>
      </Card>
    </>
  );
};
