import { ScrollText } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
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
import { getCertificateDisplayName, truncateCertificateSerialNumber } from "@app/helpers/pkiSyncs";

export type TMatchedCertificateRow = {
  id: string;
  commonName: string;
  altNames?: string | null;
  serialNumber?: string | null;
  notAfter?: string | null;
  profileName?: string | null;
};

type Props = {
  rows: TMatchedCertificateRow[];
  isLoading: boolean;
  emptyTitle: string;
  emptyDescription: string;
};

export const PkiSyncMatchedCertificatesTable = ({
  rows,
  isLoading,
  emptyTitle,
  emptyDescription
}: Props) => {
  if (isLoading) {
    return (
      <div className="flex min-h-40 flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Empty className="min-h-40 border py-8">
        <EmptyMedia variant="icon">
          <ScrollText />
        </EmptyMedia>
        <EmptyTitle>{emptyTitle}</EmptyTitle>
        <EmptyDescription>{emptyDescription}</EmptyDescription>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-full">SAN / CN</TableHead>
          <TableHead className="w-1/5">Serial Number</TableHead>
          <TableHead className="w-1/5">Profile</TableHead>
          <TableHead className="w-1/6">Expires At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const isExpired = row.notAfter ? new Date(row.notAfter) < new Date() : false;
          const { originalDisplayName } = getCertificateDisplayName(row);

          return (
            <TableRow key={row.id}>
              <TableCell className="max-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="truncate font-mono text-sm">{originalDisplayName}</div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-lg break-words">
                    {originalDisplayName}
                  </TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell className="max-w-0">
                <div className="font-mono text-xs" title={row.serialNumber ?? ""}>
                  {truncateCertificateSerialNumber(row.serialNumber ?? "")}
                </div>
              </TableCell>
              <TableCell className="max-w-0">
                <div className="truncate text-sm" title={row.profileName ?? ""}>
                  {row.profileName ?? "-"}
                </div>
              </TableCell>
              <TableCell className="max-w-0">
                <span className={isExpired ? "text-sm text-danger" : "text-sm"}>
                  {row.notAfter ? new Date(row.notAfter).toLocaleDateString() : "-"}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
