import { ReactNode } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Td, Tooltip } from "@app/components/v2";

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
    <Td className="!min-w-[8rem] max-w-0">
      <Tooltip
        side="left"
        className="max-w-2xl break-words"
        content={
          <>
            <p className="text-sm">{primaryText}</p>
            {secondaryText && (
              <p className={twMerge("text-xs leading-3 text-bunker-300", secondaryClassName)}>
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
                className="ml-1 inline-block text-bunker-300"
              />
            )}
          </p>
          {secondaryText && (
            <p
              className={twMerge("truncate text-xs leading-4 text-bunker-300", secondaryClassName)}
            >
              {secondaryText}
              {infoBadge === "secondary" && (
                <FontAwesomeIcon
                  size="xs"
                  icon={faInfoCircle}
                  className="ml-1 inline-block text-bunker-300"
                />
              )}
            </p>
          )}
        </div>
      </Tooltip>
    </Td>
  );
};
