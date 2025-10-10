import { ReactNode } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Td, Tooltip } from "@app/components/v2";

export type PkiSyncTableCellProps = {
  primaryText: string;
  secondaryText?: string;
  infoBadge?: "primary" | "secondary";
  additionalTooltipContent?: ReactNode;
  primaryClassName?: string;
  secondaryClassName?: string;
};

export const PkiSyncTableCell = ({
  primaryText,
  secondaryText,
  infoBadge,
  additionalTooltipContent,
  primaryClassName,
  secondaryClassName
}: PkiSyncTableCellProps) => {
  return (
    <Td className="min-w-32! max-w-0">
      <Tooltip
        side="left"
        className="max-w-2xl break-words"
        content={
          <>
            <p className="text-sm">{primaryText}</p>
            {secondaryText && (
              <p className={twMerge("text-bunker-300 text-xs leading-3", secondaryClassName)}>
                {secondaryText}
              </p>
            )}
            {additionalTooltipContent}
          </>
        }
      >
        <div>
          <p className={twMerge("truncate text-sm", primaryClassName)}>
            {primaryText}
            {infoBadge === "primary" && (
              <FontAwesomeIcon
                size="xs"
                icon={faInfoCircle}
                className="text-bunker-300 ml-1 inline-block"
              />
            )}
          </p>
          {secondaryText && (
            <p
              className={twMerge("text-bunker-300 truncate text-xs leading-4", secondaryClassName)}
            >
              {secondaryText}
              {infoBadge === "secondary" && (
                <FontAwesomeIcon
                  size="xs"
                  icon={faInfoCircle}
                  className="text-bunker-300 ml-1 inline-block"
                />
              )}
            </p>
          )}
        </div>
      </Tooltip>
    </Td>
  );
};
