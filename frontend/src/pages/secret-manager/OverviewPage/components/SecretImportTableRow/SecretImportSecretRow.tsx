import { TriangleAlertIcon } from "lucide-react";

import { TableCell, TableRow, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

import { SecretComment } from "../SecretTableRow/SecretComment";
import { TABLE_ROW_NAME_CELL_COLUMN_CLASS_NAME } from "../tableRowActionStyles";
import { SecretImportSecretValueCell } from "./SecretImportSecretValueCell";

type Props = {
  secretKey: string;
  environment: string;
  secretPath?: string;
  isEmpty?: boolean;
  missingFromEnvs?: string[];
  isVisible?: boolean;
  showComments?: boolean;
  commentContexts?: {
    secret: Pick<SecretV3RawSanitized, "comment" | "tags">;
    environment: string;
    environmentName: string;
    secretPath: string;
    importSource: { environmentName: string; secretPath: string };
  }[];
};

export const SecretImportSecretRow = ({
  secretKey,
  environment,
  secretPath = "/",
  isEmpty,
  missingFromEnvs,
  isVisible,
  showComments,
  commentContexts
}: Props) => {
  return (
    <TableRow className="group">
      <TableCell aria-hidden="true" className="w-10 max-w-10 min-w-10 p-0" />
      <TableCell isTruncatable className={TABLE_ROW_NAME_CELL_COLUMN_CLASS_NAME}>
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
          isVisible={isVisible}
        />
      </TableCell>
      {showComments && (
        <TableCell className="align-top">
          <div className="space-y-3">
            {commentContexts?.map((context) => (
              <div key={context.environment}>
                <p className="mb-1 text-xs text-muted">{context.environmentName}</p>
                <SecretComment secretName={secretKey} {...context} />
              </div>
            ))}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
};
