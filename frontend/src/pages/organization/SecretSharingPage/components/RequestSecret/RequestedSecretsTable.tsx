import { useState } from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
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

  const hasSecrets = !isPending && data?.secrets && data.secrets.length > 0;

  return (
    <div>
      {(isPending || hasSecrets) && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/4">Name</TableHead>
              <TableHead>Access Type</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Expires At</TableHead>
              <TableHead>Status</TableHead>
              <TableHead aria-label="button" className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 5 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`skeleton-${i}`}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`skeleton-cell-${j}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {hasSecrets &&
              data.secrets.map((row) => (
                <RequestedSecretsRow key={row.id} row={row} handlePopUpOpen={handlePopUpOpen} />
              ))}
          </TableBody>
        </Table>
      )}
      {hasSecrets && data.totalCount >= perPage && data.totalCount !== undefined && (
        <Pagination
          count={data.totalCount}
          page={page}
          perPage={perPage}
          onChangePage={(newPage) => setPage(newPage)}
          onChangePerPage={(newPerPage) => {
            setPerPage(newPerPage);
            setPage(1);
          }}
        />
      )}
      {!isPending && !data?.secrets?.length && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No Secret Requests</EmptyTitle>
            <EmptyDescription>
              Create a link that lets someone send you a secret securely.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};
