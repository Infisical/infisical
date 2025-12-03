import { useState } from "react";
import { faUsers } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  EmptyState,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { useResetPageHelper } from "@app/hooks";
import { useAddUserToGroup, useListGroupUsers } from "@app/hooks/api";
import { EFilterReturnedUsers } from "@app/hooks/api/groups/types";

type Props = {
  groupId: string;
  groupSlug: string;
  search: string;
};

export const AddGroupUsersTab = ({ groupId, groupSlug, search }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const offset = (page - 1) * perPage;
  const { data, isPending } = useListGroupUsers({
    id: groupId,
    groupSlug,
    offset,
    limit: perPage,
    search,
    filter: EFilterReturnedUsers.NON_MEMBERS
  });

  const { totalCount = 0 } = data ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { mutateAsync: addUserToGroupMutateAsync } = useAddUserToGroup();

  const handleAddUser = async (username: string) => {
    if (!groupSlug) {
      createNotification({
        text: "Some data is missing, please refresh the page and try again",
        type: "error"
      });
      return;
    }

    await addUserToGroupMutateAsync({
      groupId,
      username,
      slug: groupSlug
    });

    createNotification({
      text: "Successfully assigned user to the group",
      type: "success"
    });
  };

  return (
    <TableContainer className="mt-4">
      <Table>
        <THead>
          <Tr>
            <Th>User</Th>
            <Th />
          </Tr>
        </THead>
        <TBody>
          {isPending && <TableSkeleton columns={2} innerKey="group-users" />}
          {!isPending &&
            data?.users?.map(({ id, firstName, lastName, username }) => {
              return (
                <Tr className="items-center" key={`group-user-${id}`}>
                  <Td>
                    <p>{`${firstName ?? "-"} ${lastName ?? ""}`}</p>
                    <p>{username}</p>
                  </Td>
                  <Td className="flex justify-end">
                    <OrgPermissionCan
                      I={OrgPermissionGroupActions.Edit}
                      a={OrgPermissionSubjects.Groups}
                    >
                      {(isAllowed) => {
                        return (
                          <Button
                            isLoading={isPending}
                            isDisabled={!isAllowed}
                            colorSchema="primary"
                            variant="outline_bg"
                            type="submit"
                            onClick={() => handleAddUser(username)}
                          >
                            Assign
                          </Button>
                        );
                      }}
                    </OrgPermissionCan>
                  </Td>
                </Tr>
              );
            })}
        </TBody>
      </Table>
      {!isPending && totalCount > 0 && (
        <Pagination
          count={totalCount}
          page={page}
          perPage={perPage}
          onChangePage={(newPage) => setPage(newPage)}
          onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
        />
      )}
      {!isPending && !data?.users?.length && (
        <EmptyState
          title={search ? "No users match search" : "All users are already in the group"}
          icon={faUsers}
        />
      )}
    </TableContainer>
  );
};
