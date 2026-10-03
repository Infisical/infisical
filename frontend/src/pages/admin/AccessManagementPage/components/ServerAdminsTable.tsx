import { Dispatch, SetStateAction, useState } from "react";
import {
  AlertTriangleIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  SearchIcon,
  ShieldOffIcon,
  Trash2Icon,
  UserRoundXIcon,
  UsersIcon
} from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  SelectedActionBar,
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
  useRemoveUserServerAdminAccess
} from "@app/hooks/api";
import { User } from "@app/hooks/api/users/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { AddServerAdminModal } from "@app/pages/admin/AccessManagementPage/components/AddServerAdminModal";
import { ConfirmActionDialog } from "@app/pages/admin/components/ConfirmActionDialog";
import { V3TableEmptyState, V3TableSkeleton } from "@app/pages/admin/components/V3TableHelpers";

const removeServerAdminUpgradePlanMessage = "Removing Server Admin permissions from user";

const ServerAdminsPanelTable = ({
  handlePopUpOpen,
  users,
  isPending,
  searchUserFilter,
  setSearchUserFilter,
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
      ["removeUser", "upgradePlan", "addServerAdmin", "removeServerAdmin"]
    >,
    data?: {
      username: string;
      id: string;
      message?: string;
    }
  ) => void;
  isPending: boolean;
  users?: User[];
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
      <div className="flex items-center gap-x-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search server admins"
            value={searchUserFilter}
            onChange={(e) => setSearchUserFilter(e.target.value)}
            placeholder="Search admins..."
          />
        </InputGroup>
        <Button variant="neutral" onClick={() => handlePopUpOpen("addServerAdmin")}>
          <PlusIcon />
          Add Admin
        </Button>
      </div>
      <div className="mt-4">
        {!isEmpty && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-5">
                  <Checkbox
                    aria-label="Select all server admins on this page"
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
                </TableHead>
                <TableHead className="w-5/12">Name</TableHead>
                <TableHead className="w-1/2">Username</TableHead>
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && <V3TableSkeleton columns={4} name="users" />}
              {!isPending &&
                users?.map((user) => {
                  const { username, email, firstName, lastName, id } = user;
                  const name =
                    firstName || lastName ? `${firstName ?? ""} ${lastName ?? ""}`.trim() : null;

                  const isSelected = selectedUserIds.includes(id);
                  return (
                    <TableRow key={`user-${id}`} className="w-full">
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="w-5/12 max-w-0">
                        <p className="truncate">
                          {name ?? <span className="text-muted">Not Set</span>}
                        </p>
                      </TableCell>
                      <TableCell className="w-5/12 max-w-0">
                        <p className="truncate">{username || email}</p>
                      </TableCell>
                      <TableCell variant="action">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton aria-label="Options" size="xs" variant="ghost">
                                <EllipsisVerticalIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={2} align="end">
                              <DropdownMenuItem
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
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!subscription?.instanceUserManagement) {
                                    handlePopUpOpen("upgradePlan", {
                                      username,
                                      id,
                                      message: removeServerAdminUpgradePlanMessage
                                    });
                                    return;
                                  }
                                  handlePopUpOpen("removeServerAdmin", {
                                    username,
                                    id
                                  });
                                }}
                              >
                                <ShieldOffIcon />
                                Remove Server Admin
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
        {!isPending && isEmpty && <V3TableEmptyState title="No users found" icon={UsersIcon} />}
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

export const ServerAdminsTable = () => {
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeUser",
    "upgradePlan",
    "addServerAdmin",
    "removeServerAdmin",
    "removeUsers"
  ] as const);

  const {
    user: { id: userId }
  } = useUser();

  const { mutateAsync: deleteUser } = useAdminDeleteUser();
  const { mutateAsync: deleteUsers } = useAdminBulkDeleteUsers();
  const { mutateAsync: removeAdminAccess } = useRemoveUserServerAdminAccess();

  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [searchUserFilter, setSearchUserFilter] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchUserFilter, 500);

  const { offset, limit, setPage, perPage, page, setPerPage } = usePagination("", {
    initPerPage: getUserTablePreference("ServerAdminUsersTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("ServerAdminUsersTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isPending } = useAdminGetUsers({
    limit,
    offset,
    searchTerm: debouncedSearchTerm,
    adminsOnly: true
  });

  const { users = [], totalCount = 0 } = data ?? {};

  const handleRemoveUser = async () => {
    const { id } = popUp?.removeUser?.data as { id: string; username: string };

    await deleteUser(id);
    createNotification({
      type: "success",
      text: "Successfully deleted user"
    });

    handlePopUpClose("removeUser");
  };

  const handleRemoveServerAdminAccess = async () => {
    const { id } = popUp?.removeServerAdmin?.data as {
      id: string;
      username: string;
    };

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
      <Card className="mb-6">
        <CardContent>
          <ServerAdminsPanelTable
            handlePopUpOpen={handlePopUpOpen}
            users={users}
            selectedUsers={selectedUsers}
            setSelectedUsers={setSelectedUsers}
            searchUserFilter={searchUserFilter}
            setSearchUserFilter={setSearchUserFilter}
            isPending={isPending}
            page={page}
            perPage={perPage}
            setPage={setPage}
            handlePerPageChange={handlePerPageChange}
            totalCount={totalCount}
          />
        </CardContent>
        <ConfirmActionDialog
          isOpen={popUp.removeUser.isOpen}
          confirmationKey="remove"
          title={`Are you sure you want to delete User with username ${
            (popUp?.removeUser?.data as { id: string; username: string })?.username || ""
          }?`}
          onOpenChange={(isOpen) => handlePopUpToggle("removeUser", isOpen)}
          onConfirm={handleRemoveUser}
        />
        <ConfirmActionDialog
          isOpen={popUp.removeServerAdmin.isOpen}
          title={`Are you sure you want to remove Server Admin permissions from ${
            (popUp?.removeServerAdmin?.data as { id: string; username: string })?.username || ""
          }?`}
          onOpenChange={(isOpen) => handlePopUpToggle("removeServerAdmin", isOpen)}
          confirmationKey="confirm"
          description="You can grant Server Admin access again later."
          onConfirm={handleRemoveServerAdminAccess}
          confirmLabel="Remove Access"
        />
        <AddServerAdminModal
          isOpen={popUp.addServerAdmin.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("addServerAdmin", isOpen)}
        />
        <UpgradePlanModal
          paywallKey="admin.server-admins"
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="Your current plan does not allow removing server admins. To unlock this feature, please upgrade to Infisical Pro plan."
        />
        <ConfirmActionDialog
          isOpen={popUp.removeUsers.isOpen}
          title="Are you sure you want to delete the following users?"
          onOpenChange={(isOpen) => handlePopUpToggle("removeUsers", isOpen)}
          confirmationKey="confirm"
          onConfirm={handleRemoveUsers}
          confirmLabel="Remove"
        >
          <div className="mt-4 text-sm text-muted">The following users will be deleted:</div>
          <div className="mt-2 max-h-80 overflow-y-auto rounded-sm border border-border-control bg-danger/10 p-4 pl-8 text-sm text-danger">
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
        </ConfirmActionDialog>
      </Card>
    </>
  );
};
