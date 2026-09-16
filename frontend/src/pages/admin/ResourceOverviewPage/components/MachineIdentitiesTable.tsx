import { useState } from "react";
import {
  EllipsisVerticalIcon,
  SearchIcon,
  ServerCogIcon,
  ShieldXIcon,
  WrenchIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  TableRow
} from "@app/components/v3";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useAdminRemoveIdentitySuperAdminAccess } from "@app/hooks/api/admin";
import { useAdminGetIdentities } from "@app/hooks/api/admin/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { V3TableEmptyState, V3TableSkeleton } from "@app/pages/admin/components/V3TableHelpers";

import { ConfirmActionDialog } from "./ConfirmActionDialog";

const IdentityPanelTable = ({
  handlePopUpOpen
}: {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeServerAdmin"]>,
    data?: {
      name: string;
      id: string;
    }
  ) => void;
}) => {
  const [searchIdentityFilter, setSearchIdentityFilter] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchIdentityFilter, 500);

  const { offset, limit, setPage, perPage, page, setPerPage } = usePagination("", {
    initPerPage: getUserTablePreference(
      "ResourceOverviewIdentitiesTable",
      PreferenceKey.PerPage,
      10
    )
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("ResourceOverviewIdentitiesTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isPending } = useAdminGetIdentities({
    limit,
    offset,
    searchTerm: debouncedSearchTerm
  });

  const { identities, totalCount = 0 } = data ?? {};

  const isEmpty = !isPending && !totalCount;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  return (
    <>
      <div className="flex gap-2">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search machine identities"
            value={searchIdentityFilter}
            onChange={(e) => setSearchIdentityFilter(e.target.value)}
            placeholder="Search machine identities by name..."
          />
        </InputGroup>
      </div>
      <div className="mt-4">
        {!isEmpty && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && <V3TableSkeleton columns={2} name="identities" />}
              {!isPending &&
                identities?.map(({ name, id, isInstanceAdmin }) => (
                  <TableRow key={`identity-${id}`} className="w-full">
                    <TableCell>
                      {name}
                      {isInstanceAdmin && (
                        <Badge variant="info" className="ml-2">
                          <ServerCogIcon />
                          Server Admin
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell variant="action">
                      {isInstanceAdmin && (
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
                                  handlePopUpOpen("removeServerAdmin", {
                                    name,
                                    id
                                  });
                                }}
                              >
                                <ShieldXIcon />
                                Remove Server Admin
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
        {!isPending && isEmpty && (
          <V3TableEmptyState title="No identities found" icon={WrenchIcon} />
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
    </>
  );
};

export const MachineIdentitiesTable = () => {
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeServerAdmin"
  ] as const);

  const { mutateAsync: deleteIdentitySuperAdminAccess } = useAdminRemoveIdentitySuperAdminAccess();

  const handleRemoveServerAdmin = async () => {
    const { id } = popUp?.removeServerAdmin?.data as {
      id: string;
      name: string;
    };

    await deleteIdentitySuperAdminAccess(id);
    createNotification({
      type: "success",
      text: "Successfully removed server admin permissions"
    });

    handlePopUpClose("removeServerAdmin");
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Machine Identities</CardTitle>
        <CardDescription>Manage machine identities across your instance.</CardDescription>
      </CardHeader>
      <CardContent>
        <IdentityPanelTable handlePopUpOpen={handlePopUpOpen} />
      </CardContent>
      <ConfirmActionDialog
        isOpen={popUp.removeServerAdmin.isOpen}
        title={`Are you sure you want to remove Server Admin permissions from ${
          (popUp?.removeServerAdmin?.data as { name: string })?.name || ""
        }?`}
        description=""
        onOpenChange={(isOpen) => handlePopUpToggle("removeServerAdmin", isOpen)}
        confirmationKey="confirm"
        onConfirm={handleRemoveServerAdmin}
        confirmLabel="Remove Access"
      />
    </Card>
  );
};
