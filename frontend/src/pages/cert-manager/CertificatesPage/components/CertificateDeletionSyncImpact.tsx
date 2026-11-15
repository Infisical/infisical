import { AlertTriangleIcon, InfoIcon } from "lucide-react";

import {
  Alert,
  AlertTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadLabel,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { TPkiSync } from "@app/hooks/api/pkiSyncs/types";

import { isRemovedFromSyncDestination } from "./CertificatesTable.utils";

type Props = {
  holdingSyncs: TPkiSync[];
};

export const CertificateDeletionSyncImpact = ({ holdingSyncs }: Props) => {
  if (!holdingSyncs.length) return null;

  return (
    <div className="mt-4 w-full">
      <Alert className="mb-4" variant="warning">
        <AlertTriangleIcon className="size-4" />
        <AlertTitle>The following certificate syncs will be affected by this change</AlertTitle>
      </Alert>
      <Table containerClassName="max-h-64 overflow-y-auto">
        <TableHeader>
          <TableRow>
            <TableHead className="w-2/5">Certificate Sync</TableHead>
            <TableHead className="w-2/5">Destination</TableHead>
            <TableHead className="w-1/5">
              <TableHeadLabel
                trailing={
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      When on, the sync deletes this certificate from its destination.
                    </TooltipContent>
                  </Tooltip>
                }
              >
                Removal
              </TableHeadLabel>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdingSyncs.map((sync) => (
            <TableRow key={sync.id}>
              <TableCell isTruncatable>{sync.name}</TableCell>
              <TableCell isTruncatable>{PKI_SYNC_MAP[sync.destination].name}</TableCell>
              <TableCell>{isRemovedFromSyncDestination(sync) ? "On" : "Off"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
