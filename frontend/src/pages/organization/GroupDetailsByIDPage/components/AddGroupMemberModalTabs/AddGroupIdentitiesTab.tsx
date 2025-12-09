import { useState } from "react";
import { faServer } from "@fortawesome/free-solid-svg-icons";

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
import { useAddIdentityToGroup, useListGroupIdentities } from "@app/hooks/api";
import { FilterReturnedIdentities, TGroupIdentity } from "@app/hooks/api/groups/types";

type Props = {
  groupId: string;
  groupSlug: string;
  search: string;
};

export const AddGroupIdentitiesTab = ({ groupId, groupSlug, search }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const offset = (page - 1) * perPage;
  const { data, isPending } = useListGroupIdentities({
    id: groupId,
    groupSlug,
    offset,
    limit: perPage,
    search,
    filter: FilterReturnedIdentities.NON_ASSIGNED_IDENTITIES
  });

  const { totalCount = 0 } = data ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { mutateAsync: addIdentityToGroupMutateAsync } = useAddIdentityToGroup();

  const handleAddIdentity = async (identityId: string) => {
    if (!groupSlug) {
      createNotification({
        text: "Some data is missing, please refresh the page and try again",
        type: "error"
      });
      return;
    }

    await addIdentityToGroupMutateAsync({
      groupId,
      identityId,
      slug: groupSlug
    });

    createNotification({
      text: "Successfully assigned machine identity to the group",
      type: "success"
    });
  };

  return (
    <TableContainer className="mt-4">
      <Table>
        <THead>
          <Tr>
            <Th>Machine Identity</Th>
            <Th />
          </Tr>
        </THead>
        <TBody>
          {isPending && <TableSkeleton columns={2} innerKey="group-identities" />}
          {!isPending &&
            data?.identities?.map((identity: TGroupIdentity) => {
              return (
                <Tr className="items-center" key={`group-identity-${identity.id}`}>
                  <Td>
                    <p>{identity.name}</p>
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
                            onClick={() => handleAddIdentity(identity.id)}
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
      {!isPending && !data?.identities?.length && (
        <EmptyState
          title={
            search
              ? "No machine identities match search"
              : "All machine identities are already in the group"
          }
          icon={faServer}
        />
      )}
    </TableContainer>
  );
};
