import { useState } from "react";
import { faMagnifyingGlass, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  EmptyState,
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
  Tr
} from "@app/components/v2";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import { useAddUserToGroup, useListGroupUsers } from "@app/hooks/api";
import { EFilterReturnedUsers } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["addGroupMembers"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addGroupMembers"]>, state?: boolean) => void;
};

export const AddGroupMembersModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchMemberFilter, setSearchMemberFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchMemberFilter);

  const popUpData = popUp?.addGroupMembers?.data as {
    groupId: string;
    slug: string;
  };

  const offset = (page - 1) * perPage;
  const { data, isPending } = useListGroupUsers({
    id: popUpData?.groupId,
    groupSlug: popUpData?.slug,
    offset,
    limit: perPage,
    search: debouncedSearch,
    filter: EFilterReturnedUsers.NON_MEMBERS
  });

  const { totalCount = 0 } = data ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { mutateAsync: addUserToGroupMutateAsync } = useAddUserToGroup();

  const handleAddMember = async (username: string) => {
    if (!popUpData?.slug) {
      createNotification({
        text: "Some data is missing, please refresh the page and try again",
        type: "error"
      });
      return;
    }

    await addUserToGroupMutateAsync({
      groupId: popUpData.groupId,
      username,
      slug: popUpData.slug
    });

    createNotification({
      text: "Successfully assigned user to the group",
      type: "success"
    });
  };

  return (
    <Modal
      isOpen={popUp?.addGroupMembers?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addGroupMembers", isOpen);
      }}
    >
      <ModalContent title="Add Group Members">
        <Input
          value={searchMemberFilter}
          onChange={(e) => setSearchMemberFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search members..."
        />
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
                                onClick={() => handleAddMember(username)}
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
              title={
                debouncedSearch ? "No users match search" : "All users are already in the group"
              }
              icon={faUsers}
            />
          )}
        </TableContainer>
      </ModalContent>
    </Modal>
  );
};
