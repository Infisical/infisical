import { useCallback } from "react";
import {
  faCheck,
  faCopy,
  faEllipsisV,
  faSearch,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDistance } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretScanningScanStatusBadge } from "@app/components/secret-scanning";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import {
  TSecretScanningDataSource,
  TSecretScanningResourceWithDetails,
  useTriggerSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

type Props = {
  resource: TSecretScanningResourceWithDetails;
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningResourceRow = ({ resource, dataSource }: Props) => {
  const { id, name, lastScannedAt, lastScanStatus, unresolvedFindings } = resource;
  console.log("lastScanStatus", lastScanStatus);

  const triggerDataSourceScan = useTriggerSecretScanningDataSource();

  const handleTriggerScan = async () => {
    try {
      await triggerDataSourceScan.mutateAsync({
        dataSourceId: dataSource.id,
        type: dataSource.type,
        projectId: dataSource.projectId,
        resourceId: id
      });

      createNotification({
        text: `Successfully triggered scan for ${name}`,
        type: "success"
      });
    } catch {
      createNotification({
        text: `Failed to trigger scan for ${name}`,
        type: "error"
      });
    }
  };

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(
    (idToCopy: string) => {
      setIsIdCopied.on();
      navigator.clipboard.writeText(idToCopy);

      createNotification({
        text: "Resource ID copied to clipboard",
        type: "info"
      });

      const timer = setTimeout(() => setIsIdCopied.off(), 2000);

      // eslint-disable-next-line consistent-return
      return () => clearTimeout(timer);
    },
    [isIdCopied]
  );

  return (
    <Tr
      className={twMerge("group h-10 transition-colors duration-100 hover:bg-mineshaft-700")}
      key={`resource-${id}`}
    >
      <Td className="!min-w-[8rem] max-w-0">
        <div className="flex w-full items-center">
          <p className="truncate">{name}</p>
        </div>
      </Td>
      <Td>
        {/* eslint-disable-next-line no-nested-ternary */}
        {lastScanStatus?.match(/queued|scanning/) ? (
          <Badge
            variant="primary"
            className="flex h-5 w-min animate-pulse items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300"
          >
            <FontAwesomeIcon icon={faSearch} />
            <span>Scanning For Leaks</span>
          </Badge>
        ) : // eslint-disable-next-line no-nested-ternary
        lastScannedAt ? (
          unresolvedFindings ? (
            <Badge
              variant="primary"
              className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faWarning} />
              <span>
                {unresolvedFindings} Secret{unresolvedFindings > 1 ? "s" : ""} Detected
              </span>
            </Badge>
          ) : (
            <Badge
              variant="success"
              className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faCheck} />
              No Secrets Detected
            </Badge>
          )
        ) : (
          "-"
        )}
      </Td>
      <Td className="whitespace-nowrap">
        {/* eslint-disable-next-line no-nested-ternary */}
        {lastScanStatus?.match(/queued|scanning/) ? (
          <SecretScanningScanStatusBadge status={lastScanStatus} />
        ) : lastScannedAt ? (
          formatDistance(new Date(lastScannedAt), new Date(), { addSuffix: true })
        ) : (
          "-"
        )}
      </Td>
      <Td>
        <ProjectPermissionCan
          I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
          a={ProjectPermissionSub.SecretScanningDataSources}
        >
          {(isAllowed) => (
            <Button
              onClick={handleTriggerScan}
              isLoading={triggerDataSourceScan.isPending}
              isDisabled={triggerDataSourceScan.isPending || !isAllowed}
              size="xs"
              colorSchema="secondary"
            >
              Scan
            </Button>
          )}
        </ProjectPermissionCan>
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
                  handleCopyId(id);
                }}
              >
                Copy Data Source ID
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </Td>
    </Tr>
  );
};
