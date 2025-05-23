import { useCallback } from "react";
import { faGit } from "@fortawesome/free-brands-svg-icons";
import {
  faCheck,
  faCopy,
  faEllipsisV,
  faExpand,
  faSearch,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
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
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
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
  const totalFindings = resolvedFindings + unresolvedFindings;
  console.log("totalFindings", totalFindings, resolvedFindings, unresolvedFindings);

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
    <Tr
      className={twMerge(
        "group h-10 transition-colors duration-100 hover:bg-mineshaft-700",
        status === SecretScanningScanStatus.Failed && "bg-red/5 hover:bg-red/10"
      )}
      key={`scan-${id}`}
    >
      <Td>
        {type === SecretScanningScanType.FullScan ? (
          <Tooltip content="Full Scan">
            <div>
              <Badge
                variant="success"
                className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300"
              >
                <FontAwesomeIcon icon={faExpand} />
              </Badge>
            </div>
          </Tooltip>
        ) : (
          <Tooltip content="Diff Scan">
            <div>
              <Badge
                variant="primary"
                className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300"
              >
                <FontAwesomeIcon icon={faGit} />
              </Badge>
            </div>
          </Tooltip>
        )}
      </Td>
      <Td>
        <div className="">
          <p>{format(createdAt, "MMM dd yyyy")}</p>
          <p className="text-xs text-mineshaft-400">{format(createdAt, "HH:mm aa")}</p>
        </div>
      </Td>
      <Td className="!min-w-[8rem] max-w-0">
        <div className="flex w-full items-center">
          <p className="truncate">{resourceName}</p>
        </div>
      </Td>
      <Td>
        {
          // eslint-disable-next-line no-nested-ternary
          status?.match(/queued|scanning/) ? (
            <Badge
              variant="primary"
              className="flex h-5 w-min animate-pulse items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300"
            >
              <FontAwesomeIcon icon={faSearch} />
              <span>Scanning For Leaks</span>
            </Badge>
          ) : totalFindings ? (
            <div className="flex flex-col">
              {unresolvedFindings && (
                <Badge
                  variant={unresolvedFindings ? "primary" : undefined}
                  className={twMerge(
                    "flex h-5 w-min items-center gap-1.5 whitespace-nowrap",
                    !unresolvedFindings && "bg-mineshaft-400/50 text-bunker-300"
                  )}
                >
                  <FontAwesomeIcon icon={unresolvedFindings ? faWarning : faCheck} />
                  <span className="text-xs">
                    {totalFindings}{" "}
                    {unresolvedFindings
                      ? `Secret ${totalFindings > 1 ? "s" : ""} Detected`
                      : "Leak Resolved"}
                  </span>
                </Badge>
              )}
            </div>
          ) : (
            <Badge
              variant="success"
              className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faCheck} />
              No Secrets Detected
            </Badge>
          )
        }
      </Td>
      <Td className="whitespace-nowrap">
        <SecretScanningScanStatusBadge status={status} statusMessage={statusMessage} />
      </Td>
      <Td>
        <Tooltip className="max-w-sm text-center" content="Options">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                ariaLabel="Options"
                colorSchema="secondary"
                className="w-6"
                variant="plain"
              >
                <FontAwesomeIcon icon={faEllipsisV} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyId();
                }}
              >
                Copy Scan ID
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </Td>
    </Tr>
  );
};
