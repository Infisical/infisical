import { TriangleAlertIcon } from "lucide-react";

import { TableCell, TableRow, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

import { SecretImportSecretValueCell } from "./SecretImportSecretValueCell";

type Props = {
  secretKey: string;
  environment: string;
  secretPath?: string;
  isEmpty?: boolean;
  missingFromEnvs?: string[];
};

export const SecretImportSecretRow = ({
  secretKey,
  environment,
  secretPath = "/",
  isEmpty,
  missingFromEnvs
}: Props) => {
  return (
    <TableRow className="group">
      <TableCell isTruncatable>
        <div className="flex items-center gap-1.5">
          <span className="truncate">{secretKey}</span>
          {missingFromEnvs && missingFromEnvs.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TriangleAlertIcon className="size-3 shrink-0 text-warning" />
              </TooltipTrigger>
              <TooltipContent>Missing from {missingFromEnvs.join(", ")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell>
        <SecretImportSecretValueCell
          secretKey={secretKey}
          environment={environment}
          secretPath={secretPath}
          isEmpty={isEmpty}
        />
      </TableCell>
    </TableRow>
  );
};
