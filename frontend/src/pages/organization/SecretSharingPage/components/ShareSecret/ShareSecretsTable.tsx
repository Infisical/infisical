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
import { useGetSharedSecrets } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { ShareSecretsRow } from "./ShareSecretsRow";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSharedSecretConfirmation"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
};

export const ShareSecretsTable = ({ handlePopUpOpen }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const { isPending, data } = useGetSharedSecrets({
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
              <TableHead className="w-5" />
              <TableHead className="w-1/4">Name</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Expires At</TableHead>
              <TableHead>Views Remaining</TableHead>
              <TableHead>Status</TableHead>
              <TableHead aria-label="button" className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 5 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`skeleton-${i}`}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`skeleton-cell-${j}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {hasSecrets &&
              data.secrets.map((row) => (
                <ShareSecretsRow key={row.id} row={row} handlePopUpOpen={handlePopUpOpen} />
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
            <EmptyTitle>No Shared Secrets</EmptyTitle>
            <EmptyDescription>
              Create a secure link to share sensitive information.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};
