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
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Views Left</TableHead>
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
                    <td key={`skeleton-cell-${j}`} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
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
          onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
        />
      )}
      {!isPending && !data?.secrets?.length && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No secrets shared yet</EmptyTitle>
            <EmptyDescription>Share a secret to get started</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};
