import { useState } from "react";

import {
  Checkbox,
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
import { TSharedSecret, useGetSharedSecrets } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { ShareSecretsRow } from "./ShareSecretsRow";

type Props = {
  selectedIds: string[];
  setSelectedIds: (updater: (prev: string[]) => string[]) => void;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSharedSecretConfirmation", "editSharedSecret"]>,
    data: { name: string; id: string } | TSharedSecret
  ) => void;
};

export const ShareSecretsTable = ({ selectedIds, setSelectedIds, handlePopUpOpen }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const { isPending, data } = useGetSharedSecrets({
    offset: (page - 1) * perPage,
    limit: perPage
  });
  const hasSecrets = !isPending && data?.secrets && data.secrets.length > 0;

  const pageSecrets = data?.secrets ?? [];
  const isPageSelected =
    pageSecrets.length > 0 && pageSecrets.every((secret) => selectedIds.includes(secret.id));
  const isPageIndeterminate =
    !isPageSelected && pageSecrets.some((secret) => selectedIds.includes(secret.id));

  return (
    <div>
      {(isPending || hasSecrets) && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-5">
                <Checkbox
                  id="shared-secret-page-select"
                  isChecked={isPageSelected || isPageIndeterminate}
                  isIndeterminate={isPageIndeterminate}
                  isDisabled={pageSecrets.length === 0}
                  variant="project"
                  onCheckedChange={() => {
                    if (isPageSelected) {
                      setSelectedIds((prev) =>
                        prev.filter((id) => !pageSecrets.some((secret) => secret.id === id))
                      );
                    } else {
                      setSelectedIds((prev) => [
                        ...new Set([...prev, ...pageSecrets.map((secret) => secret.id)])
                      ]);
                    }
                  }}
                />
              </TableHead>
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
                  {Array.from({ length: 8 }).map((__, j) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`skeleton-cell-${j}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {hasSecrets &&
              data.secrets.map((row) => (
                <ShareSecretsRow
                  key={row.id}
                  row={row}
                  isSelected={selectedIds.includes(row.id)}
                  onToggleSelect={() =>
                    setSelectedIds((prev) =>
                      prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]
                    )
                  }
                  handlePopUpOpen={handlePopUpOpen}
                />
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
