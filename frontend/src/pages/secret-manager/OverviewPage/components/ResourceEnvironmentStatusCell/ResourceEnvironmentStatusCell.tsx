import { BanIcon, CheckIcon, CircleIcon, ImportIcon, LucideIcon, XIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Tooltip, TooltipContent, TooltipTrigger, UnstableTableCell } from "@app/components/v3";

export type EnvironmentStatus = "present" | "missing" | "empty" | "imported" | "no-access";

type Props = {
  status: EnvironmentStatus;
};

export const ResourceEnvironmentStatusCell = ({ status }: Props) => {
  let tooltipContent: string;
  let Icon: LucideIcon;
  let iconClassName: string;

  switch (status) {
    case "present":
      tooltipContent = "Present in environment";
      iconClassName = "text-success";
      Icon = CheckIcon;
      break;
    case "missing":
      tooltipContent = "Missing from environment";
      iconClassName = "text-danger";
      Icon = XIcon;
      break;
    case "empty":
      tooltipContent = "Empty value in environment";
      iconClassName = "text-warning";
      Icon = CircleIcon;
      break;
    case "imported":
      tooltipContent = "Imported into environment";
      Icon = ImportIcon;
      iconClassName = "text-import";
      break;
    case "no-access":
      tooltipContent = "You do not have permission to view this resource";
      iconClassName = "text-muted";
      Icon = BanIcon;
      break;
    default:
      throw new Error(`Unhandled environment status: ${status as string}`);
  }

  return (
    <UnstableTableCell
      className={twMerge(
        "border-r text-center last:border-r-0",
        status === "present" && "text-success",
        status === "empty" && "text-warning",
        status === "missing" && "text-danger",
        status === "no-access" && "text-accent",
        status === "imported" && "text-import"
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Icon className={twMerge(iconClassName, "inline-block")} />
        </TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    </UnstableTableCell>
  );
};
