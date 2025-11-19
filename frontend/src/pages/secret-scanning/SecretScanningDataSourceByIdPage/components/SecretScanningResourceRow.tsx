import { useCallback } from "react";
import {
  faCheck,
  faCopy,
  faEllipsisV,
  faExpand,
  faInfoCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { formatDistance } from "date-fns";
import { AlertTriangleIcon, BanIcon, ScanTextIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretScanningScanStatusBadge } from "@app/components/secret-scanning";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import { useToggle } from "@app/hooks";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus,
  SecretScanningScanStatus,
  TSecretScanningDataSource,
  TSecretScanningResourceWithDetails,
  useTriggerSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

type Props = {
  resource: TSecretScanningResourceWithDetails;
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningResourceRow = ({ resource, dataSource }: Props) => {
  const { id, name, lastScannedAt, lastScanStatus, unresolvedFindings, lastScanStatusMessage } =
    resource;

  const { currentOrg } = useOrganization();
  let isActive: boolean;

  switch (dataSource.type) {
    case SecretScanningDataSource.Bitbucket:
    case SecretScanningDataSource.GitHub:
      isActive =
        dataSource.config.includeRepos.includes("*") ||
        dataSource.config.includeRepos.includes(name);
      break;
    case SecretScanningDataSource.GitLab: {
      if (dataSource.config.scope === GitLabDataSourceScope.Project) {
        isActive = true; // always active
      } else {
        isActive =
          dataSource.config.includeProjects.includes("*") ||
          dataSource.config.includeProjects.includes(name);
      }
      break;
    }
    default:
      throw new Error("Unhandled Data Source Type: Active Status");
  }

  // scott: will need to be differentiated by type once other data sources are available

  const triggerDataSourceScan = useTriggerSecretScanningDataSource();

  const navigate = useNavigate();

  const handleTriggerScan = async () => {
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
      <Td className="max-w-0 min-w-32!">
        <div className="flex w-full items-center">
          <p className="truncate">{name}</p>
        </div>
      </Td>
      <Td>
        {/* eslint-disable-next-line no-nested-ternary */}
        {lastScanStatus?.match(/queued|scanning/) ? (
          <Badge variant="neutral">
            <ScanTextIcon />
            Scanning For Leaks
          </Badge>
        ) : // eslint-disable-next-line no-nested-ternary
        lastScannedAt ? (
          // eslint-disable-next-line no-nested-ternary
          unresolvedFindings ? (
            <Badge asChild variant="warning">
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/organizations/$orgId/projects/secret-scanning/$projectId/findings",
                    params: {
                      orgId: currentOrg.id,
                      projectId: dataSource.projectId
                    },
                    search: {
                      search: name,
                      status: SecretScanningFindingStatus.Unresolved
                    }
                  })
                }
              >
                <AlertTriangleIcon />
                {unresolvedFindings} Secret{unresolvedFindings > 1 ? "s" : ""} Detected
              </button>
            </Badge>
          ) : lastScanStatus === SecretScanningScanStatus.Failed ? (
            <span className="text-mineshaft-400">No findings</span>
          ) : (
            <Badge variant="success">
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
              <Badge className="ml-auto" variant="neutral">
                <BanIcon />
                Inactive
              </Badge>
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
