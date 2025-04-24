import { useState } from "react";
import { faKey } from "@fortawesome/free-solid-svg-icons";

import {
  EmptyState,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useGetSecretRequests } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { RequestedSecretsRow } from "./RequestedSecretsRow";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSecretRequestConfirmation", "revealSecretRequestValue"]>,
    data: unknown
  ) => void;
};

export const RequestedSecretsTable = ({ handlePopUpOpen }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const { isPending, data } = useGetSecretRequests({
    offset: (page - 1) * perPage,
    limit: perPage
  });
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Status</Th>
            <Th>Access Type</Th>
            <Th>Created At</Th>
            <Th>Valid Until</Th>
            <Th aria-label="button" className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isPending && <TableSkeleton columns={7} innerKey="shared-secrets" />}
          {!isPending &&
            data?.secrets?.map((row) => (
              <RequestedSecretsRow key={row.id} row={row} handlePopUpOpen={handlePopUpOpen} />
            ))}
        </TBody>
      </Table>
      {!isPending &&
        data?.secrets &&
        data?.totalCount >= perPage &&
        data?.totalCount !== undefined && (
          <Pagination
            count={data.totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
          />
        )}
      {!isPending && !data?.secrets?.length && (
        <EmptyState title="No secrets requested yet" icon={faKey} />
      )}
    </TableContainer>
  );
};
