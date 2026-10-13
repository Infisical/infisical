import { useCallback } from "react";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { formatDistance } from "date-fns";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  InfoIcon,
  ScanIcon,
  ScanTextIcon
} from "lucide-react";
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
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    <TableRow
      className={twMerge(
        "group",
        lastScanStatus === SecretScanningScanStatus.Failed && "bg-danger/5 hover:bg-danger/10"
      )}
      key={`resource-${id}`}
    >
      <TableCell isTruncatable className="min-w-32">
        <div className="flex w-full items-center">
          <p className="truncate">{name}</p>
        </div>
      </TableCell>
      <TableCell>
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
            <span className="text-muted">No findings</span>
          ) : (
            <Badge variant="success">
              <FontAwesomeIcon icon={faCheck} />
              No Secrets Detected
            </Badge>
          )
        ) : (
          <span className="text-muted">No findings</span>
        )}
      </TableCell>
      <TableCell>
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
          <span className="text-muted">No scans</span>
        )}
      </TableCell>
      <TableCell variant="action">
        <div className="flex items-center justify-end gap-2">
          {!isActive && (
            <Tooltip hoverable delayDuration={50}>
              <TooltipTrigger asChild>
                <Badge className="ml-auto" variant="neutral">
                  <BanIcon />
                  Inactive
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                This {resourceDetails.singularNoun} will not be scanned due to exclusion in Data
                Source configuration.
              </TooltipContent>
            </Tooltip>
          )}
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
                  handleCopyId(id);
                }}
              >
                {isIdCopied ? <CheckIcon /> : <CopyIcon />}
                Copy Resource ID
              </DropdownMenuItem>
              <ProjectPermissionCan
                I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
                a={ProjectPermissionSub.SecretScanningDataSources}
              >
                {(isAllowed) => (
                  <Tooltip hoverable delayDuration={50}>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem
                        isDisabled={!isAllowed || !isActive}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTriggerScan();
                        }}
                      >
                        <ScanIcon />
                        Trigger Scan
                        <InfoIcon className="ml-auto text-muted" />
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      Manually trigger a scan for this {resourceDetails.singularNoun}.
                    </TooltipContent>
                  </Tooltip>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
