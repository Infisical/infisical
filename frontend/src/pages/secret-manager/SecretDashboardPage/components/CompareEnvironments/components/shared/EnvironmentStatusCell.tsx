import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faCircle } from "@fortawesome/free-regular-svg-icons";
import { faBan, faCheck, faFileImport, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Td, Tooltip } from "@app/components/v2";

export type EnvironmentStatus = "present" | "missing" | "empty" | "imported" | "no-access";

type Props = {
  isLast: boolean;
  status: EnvironmentStatus;
};

export const EnvironmentStatusCell = ({ isLast, status }: Props) => {
  let tooltipContent: string;
  let icon: IconDefinition;
  let iconClassName: string;

  switch (status) {
    case "present":
      tooltipContent = "Present in environment";
      icon = faCheck;
      iconClassName = "h-3 w-3";
      break;
    case "missing":
      tooltipContent = "Missing from environment";
      icon = faXmark;
      iconClassName = "h-3.5 w-3.5";
      break;
    case "empty":
      tooltipContent = "Empty value in environment";
      icon = faCircle;
      iconClassName = "h-3 w-3";
      break;
    case "imported":
      tooltipContent = "Imported into environment";
      icon = faFileImport;
      iconClassName = "h-3 w-3";
      break;
    case "no-access":
      tooltipContent = "You do not have permission to view this secret";
      icon = faBan;
      iconClassName = "h-3 w-3";
      break;
    default:
      throw new Error(`Unhandled environment status: ${status as string}`);
  }

  return (
    <Td
      className={twMerge(
        "border-mineshaft-500 group-hover:bg-mineshaft-600 border-b bg-clip-padding p-0",
        (status === "present" || status === "imported") && "text-green-600",
        status === "empty" && "text-yellow",
        status === "missing" && "text-red-600",
        status === "no-access" && "text-bunker-400"
      )}
    >
      <div
        className={twMerge(
          "border-mineshaft-500 flex h-10 items-center justify-center px-0 py-3",
          !isLast && "border-r"
        )}
      >
        <div className="flex justify-center">
          <Tooltip center content={tooltipContent}>
            <FontAwesomeIcon className={iconClassName} icon={icon} />
          </Tooltip>
        </div>
      </div>
    </Td>
  );
};
