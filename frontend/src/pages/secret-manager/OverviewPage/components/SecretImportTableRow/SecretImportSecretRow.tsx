import { TriangleAlertIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableTableCell,
  UnstableTableRow
} from "@app/components/v3";

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
    <UnstableTableRow className="group">
      <UnstableTableCell isTruncatable>
        <div className="flex items-center gap-1.5">
          {secretKey}
          {missingFromEnvs && missingFromEnvs.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TriangleAlertIcon className="size-3 shrink-0 text-warning" />
              </TooltipTrigger>
              <TooltipContent>Missing from {missingFromEnvs.join(", ")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </UnstableTableCell>
      <UnstableTableCell>
        <SecretImportSecretValueCell
          secretKey={secretKey}
          environment={environment}
          secretPath={secretPath}
          isEmpty={isEmpty}
        />
      </UnstableTableCell>
    </UnstableTableRow>
  );
};
