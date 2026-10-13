import { useCallback } from "react";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { AlertTriangleIcon, CheckIcon, CopyIcon, EllipsisVerticalIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { SecretScanningScanStatusBadge } from "@app/components/secret-scanning";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useToggle } from "@app/hooks";
import {
  SecretScanningScanStatus,
  SecretScanningScanType,
  TSecretScanningScanWithDetails
} from "@app/hooks/api/secretScanningV2";

type Props = {
  scan: TSecretScanningScanWithDetails;
};

export const SecretScanningScanRow = ({ scan }: Props) => {
  const {
    id,
    resourceName,
    createdAt,
    status,
    statusMessage,
    unresolvedFindings,
    resolvedFindings,
    type
  } = scan;
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const totalFindings = resolvedFindings + unresolvedFindings;
  const navigate = useNavigate();

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(id);

    createNotification({
      text: "Scan ID copied to clipboard",
      type: "info"
    });

    const timer = setTimeout(() => setIsIdCopied.off(), 2000);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timer);
  }, [isIdCopied]);

  return (
    <TableRow
      className={twMerge(
        "group",
        status === SecretScanningScanStatus.Failed && "bg-danger/5 hover:bg-danger/10"
      )}
      key={`scan-${id}`}
    >
      <TableCell>
        <p>
          {format(createdAt, "MMM dd yyyy")}{" "}
          <span className="text-label">{format(createdAt, "h:mm aa")}</span>
        </p>
      </TableCell>
      <TableCell isTruncatable className="min-w-32">
        <div className="flex flex-col">
          <p className="truncate">{resourceName}</p>
        </div>
      </TableCell>
      <TableCell>
        {type === SecretScanningScanType.Historical ? "Historical Scan" : "Realtime Scan"}
      </TableCell>
      <TableCell>
        {
          // eslint-disable-next-line no-nested-ternary
          status?.match(/queued|scanning|failed/) ? (
            <SecretScanningScanStatusBadge status={status} statusMessage={statusMessage} />
          ) : // eslint-disable-next-line no-nested-ternary
          totalFindings ? (
            <div className="flex flex-col">
              <Badge asChild variant={unresolvedFindings ? "warning" : "success"}>
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/organizations/$orgId/projects/secret-scanning/$projectId/findings",
                      params: {
                        orgId: currentOrg.id,
                        projectId: currentProject.id
                      },
                      search: {
                        search: `scanId:${id}`
                      }
                    })
                  }
                >
                  {unresolvedFindings ? <AlertTriangleIcon /> : <CheckIcon />}
                  {totalFindings}{" "}
                  {unresolvedFindings
                    ? `Secret${totalFindings > 1 ? "s" : ""} Detected`
                    : "Leak Resolved"}
                </button>
              </Badge>
            </div>
          ) : status === SecretScanningScanStatus.Failed ? (
            <span className="text-muted">No findings</span>
          ) : (
            <Badge variant="success">
              <FontAwesomeIcon icon={faCheck} />
              No Secrets Detected
            </Badge>
          )
        }
      </TableCell>
      <TableCell variant="action">
        <DropdownMenu>
          <Tooltip hoverable delayDuration={50}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="Options" variant="ghost" size="xs">
                  <EllipsisVerticalIcon />
                </IconButton>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Options</TooltipContent>
          </Tooltip>
          <DropdownMenuContent sideOffset={2} align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleCopyId();
              }}
            >
              {isIdCopied ? <CheckIcon /> : <CopyIcon />}
              Copy Scan ID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
