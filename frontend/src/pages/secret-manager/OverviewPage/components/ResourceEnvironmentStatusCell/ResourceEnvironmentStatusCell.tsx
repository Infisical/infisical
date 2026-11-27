import { MouseEventHandler, ReactNode } from "react";
import {
  BanIcon,
  CheckIcon,
  CircleIcon,
  GitBranchIcon,
  ImportIcon,
  LucideIcon,
  MinusIcon,
  PencilLineIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { TableCell, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { PendingAction } from "@app/hooks/api/secretFolders/types";

import { pendingActionBorderClass, pendingActionRowClass } from "../pendingActionStyles";

export type EnvironmentStatus = "present" | "missing" | "empty" | "imported" | "no-access";

type Props = {
  status: EnvironmentStatus;
  hasOverride?: boolean;
  pendingAction?: PendingAction.Create | PendingAction.Update;
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLTableCellElement>;
};

export const ResourceEnvironmentStatusCell = ({
  status,
  hasOverride,
  pendingAction,
  children,
  className,
  onClick
}: Props) => {
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
      iconClassName = "text-muted";
      Icon = MinusIcon;
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
    <TableCell
      className={twMerge(
        "relative border-r last:border-r-0",
        status === "present" && "text-success",
        status === "empty" && "text-warning",
        status === "missing" && "text-danger",
        status === "no-access" && "text-accent",
        status === "imported" && "text-import",
        pendingActionRowClass(pendingAction),
        pendingActionBorderClass(pendingAction),
        className
      )}
      onClick={onClick}
    >
      {hasOverride && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute top-5 right-0 bottom-0 flex w-5 flex-col rounded-tl border-t border-l border-override/50 bg-override/15">
              <GitBranchIcon className="m-auto size-3 text-override-foreground" />
            </div>
          </TooltipTrigger>
          <TooltipContent>Has personal override</TooltipContent>
        </Tooltip>
      )}
      <div className={twMerge("flex items-center justify-between gap-2", hasOverride && "pr-4")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Icon className={twMerge(iconClassName, "size-4 shrink-0")} />
          </TooltipTrigger>
          <TooltipContent>{tooltipContent}</TooltipContent>
        </Tooltip>
        {pendingAction && (
          <Tooltip>
            <TooltipTrigger asChild>
              <PencilLineIcon className="mr-auto size-3.5 shrink-0 text-project" />
            </TooltipTrigger>
            <TooltipContent>
              {pendingAction === PendingAction.Create ? "Unsaved new value" : "Unsaved change"}
            </TooltipContent>
          </Tooltip>
        )}
        {children}
      </div>
    </TableCell>
  );
};
