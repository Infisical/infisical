import { useCallback } from "react";
import {
  faBan,
  faCheck,
  faCopy,
  faEllipsisV,
  faExpand,
  faInfoCircle,
  faSearch,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { formatDistance } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
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
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import { useToggle } from "@app/hooks";
import {
  SecretScanningFindingStatus,
  SecretScanningScanStatus,
  TSecretScanningDataSource,
  TSecretScanningResourceWithDetails,
  useTriggerSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

type Props = {
  resource: TSecretScanningResourceWithDetails;
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningResourceRow = ({ resource, dataSource }: Props) => {
  const { id, name, lastScannedAt, lastScanStatus, unresolvedFindings, lastScanStatusMessage } =
    resource;

  const {
    config: { includeRepos }
  } = dataSource;

  // scott: will need to be differentiated by type once other data sources are available
  const isActive = includeRepos.includes("*") || includeRepos.includes(name);

  const triggerDataSourceScan = useTriggerSecretScanningDataSource();

  const navigate = useNavigate();

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

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  return (
    <Tr
      className={twMerge(
        "group h-10 transition-colors duration-100 hover:bg-mineshaft-700",
        lastScanStatus === SecretScanningScanStatus.Failed && "bg-red/5 hover:bg-red/10"
      )}
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
          // eslint-disable-next-line no-nested-ternary
          unresolvedFindings ? (
            <Badge
              onClick={() =>
                navigate({
                  to: "/projects/$projectId/secret-scanning/findings",
                  params: {
                    projectId: dataSource.projectId
                  },
                  search: {
                    search: name,
                    status: SecretScanningFindingStatus.Unresolved
                  }
                })
              }
              variant="primary"
              className="flex h-5 w-min cursor-pointer items-center gap-1.5 whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faWarning} />
              <span>
                {unresolvedFindings} Secret{unresolvedFindings > 1 ? "s" : ""} Detected
              </span>
            </Badge>
          ) : lastScanStatus === SecretScanningScanStatus.Failed ? (
            <span className="text-mineshaft-400">No findings</span>
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
          <span className="text-mineshaft-400">No findings</span>
        )}
      </Td>
      <Td className="whitespace-nowrap">
        {/* eslint-disable-next-line no-nested-ternary */}
        {lastScanStatus?.match(/queued|scanning|failed/) ? (
          <SecretScanningScanStatusBadge
            status={lastScanStatus}
            statusMessage={lastScanStatusMessage}
            scannedAt={lastScannedAt}
          />
        ) : lastScannedAt ? (
          formatDistance(new Date(lastScannedAt), new Date(), { addSuffix: true })
        ) : (
          <span className="text-mineshaft-400">No scans</span>
        )}
      </Td>
      <Td>
        <div className="flex items-center justify-end gap-2">
          {!isActive && (
            <Tooltip
              className="text-xs"
              content={`This ${resourceDetails.singularNoun} will not be scanned due to exclusion in Data Source configuration.`}
            >
              <div className="ml-auto">
                <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
                  <FontAwesomeIcon icon={faBan} />
                  <span>Inactive</span>
                </Badge>
              </div>
            </Tooltip>
          )}
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
                  Copy Resource ID
                </DropdownMenuItem>
                <ProjectPermissionCan
                  I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
                  a={ProjectPermissionSub.SecretScanningDataSources}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      isDisabled={!isAllowed || !isActive}
                      icon={<FontAwesomeIcon icon={faExpand} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTriggerScan();
                      }}
                    >
                      <Tooltip
                        position="left"
                        sideOffset={42}
                        content={`Manually trigger a scan for this ${resourceDetails.singularNoun}.`}
                      >
                        <div className="flex h-full w-full items-center justify-between gap-1">
                          <span>Trigger Scan</span>
                          <FontAwesomeIcon
                            className="text-bunker-300"
                            size="sm"
                            icon={faInfoCircle}
                          />
                        </div>
                      </Tooltip>
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </Tooltip>
        </div>
      </Td>
    </Tr>
  );
};
