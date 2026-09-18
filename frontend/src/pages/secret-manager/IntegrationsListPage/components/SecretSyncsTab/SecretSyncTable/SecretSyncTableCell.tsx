import { ReactNode } from "react";
import { InfoIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { TableCell, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

export type SecretSyncTableCellProps = {
  primaryText: string;
  secondaryText?: string;
  infoBadge?: "primary" | "secondary";
  additionalTooltipContent?: ReactNode;
  primaryClassName?: string;
  secondaryClassName?: string;
};

export const SecretSyncTableCell = ({
  primaryText,
  secondaryText,
  infoBadge,
  additionalTooltipContent,
  primaryClassName,
  secondaryClassName
}: SecretSyncTableCellProps) => {
  return (
    <TableCell className="max-w-0 min-w-32!">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <p className={twMerge("truncate text-sm", primaryClassName)}>
              {primaryText}
              {infoBadge === "primary" && (
                <InfoIcon className="ml-1 inline-block size-3 text-accent" />
              )}
            </p>
            {secondaryText && (
              <p className={twMerge("truncate text-xs leading-4 text-accent", secondaryClassName)}>
                {secondaryText}
                {infoBadge === "secondary" && (
                  <InfoIcon className="ml-1 inline-block size-3 text-accent" />
                )}
              </p>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-2xl break-words">
          <p className="text-sm">{primaryText}</p>
          {secondaryText && (
            <p className={twMerge("text-xs leading-3 text-accent", secondaryClassName)}>
              {secondaryText}
            </p>
          )}
          {additionalTooltipContent}
        </TooltipContent>
      </Tooltip>
    </TableCell>
  );
};
