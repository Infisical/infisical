import { ReactElement } from "react";
import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faAngleDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Td, Tooltip } from "@app/components/v2";

type Props = {
  isRowExpanded?: boolean;
  label: ReactElement | string;
  icon: IconDefinition;
  iconClassName?: string;
  colWidth: number;
  tooltipContent?: string;
};

export const ResourceNameCell = ({
  isRowExpanded,
  label,
  icon,
  iconClassName,
  colWidth,
  tooltipContent
}: Props) => {
  return (
    <Td
      className="sticky left-0 z-10 border-b border-mineshaft-500 bg-mineshaft-700 bg-clip-padding p-0 group-hover:bg-mineshaft-600"
      style={{
        width: colWidth
      }}
    >
      <Tooltip content={tooltipContent} className="max-w-sm">
        <div
          style={{
            width: colWidth
          }}
          className="flex h-10 items-center space-x-5 border-r border-mineshaft-600 px-4 py-2.5"
        >
          <div className="w-5 min-w-5">
            <FontAwesomeIcon className={iconClassName} icon={isRowExpanded ? faAngleDown : icon} />
          </div>
          {typeof label === "string" ? <span className="truncate">{label}</span> : label}
        </div>
      </Tooltip>
    </Td>
  );
};
