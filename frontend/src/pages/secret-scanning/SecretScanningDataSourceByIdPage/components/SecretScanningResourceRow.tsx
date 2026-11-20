import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  MoreHorizontalIcon,
  ScanSearchIcon,
  TrashIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretScanningScanStatusBadge } from "@app/components/secret-scanning";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  RowLink,
  TableCell,
  TableRow
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { getInstancePinningLink } from "@app/helpers/project";
import {
  canAddSecretScanningResources,
  RESOURCE_DESCRIPTION_HELPER
} from "@app/helpers/secretScanningV2";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  SecretScanningScanStatus,
  TSecretScanningDataSource,
  TSecretScanningResourceWithDetails,
  useRemoveSecretScanningResource,
  useTriggerSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { DataSourceTab } from "../data-source-tabs";

type Props = {
  resource: TSecretScanningResourceWithDetails;
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningResourceRow = ({ resource, dataSource }: Props) => {
  const { id, name, lastScannedAt, lastScanStatus, unresolvedFindings, lastScanStatusMessage } =
    resource;
  const { currentOrg } = useOrganization();

  const findingsSearch = { selectedTab: DataSourceTab.Findings, resourceId: id };
  const pinnedLink = getInstancePinningLink(
    currentOrg.id,
    { id: dataSource.projectId, type: ProjectType.SecretScanning },
    `data-sources/${dataSource.type}/${dataSource.id}`
  );
  const findingsLink = pinnedLink
    ? { ...pinnedLink, search: findingsSearch as never }
    : ({
        to: ROUTE_PATHS.SecretScanning.DataSourceByIdPage.path,
        params: { orgId: currentOrg.id, type: dataSource.type, dataSourceId: dataSource.id },
        search: findingsSearch
      } as const);

  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  // a project-scoped GitLab data source scans exactly one project, so removing it would leave nothing
  const canRemove = canAddSecretScanningResources(dataSource);

  const triggerDataSourceScan = useTriggerSecretScanningDataSource();
  const removeResource = useRemoveSecretScanningResource();

  const handleTriggerScan = async () => {
    await triggerDataSourceScan.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId,
      resourceId: id
    });

    createNotification({
      text: `Scan triggered for "${name}"`,
      type: "success"
    });
  };

  const handleRemove = async () => {
    await removeResource.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId,
      resourceId: id
    });

    setIsRemoveOpen(false);
    createNotification({
      text: `Removed "${name}"`,
      type: "success"
    });
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(id);
    createNotification({ text: "Resource ID copied to clipboard", type: "info" });
  };

  const renderStatus = () => {
    if (lastScanStatus && lastScanStatus !== SecretScanningScanStatus.Completed) {
      return (
        <SecretScanningScanStatusBadge
          status={lastScanStatus}
          statusMessage={lastScanStatusMessage}
          scannedAt={lastScannedAt}
        />
      );
    }

    if (!lastScannedAt) return <span className="text-muted">Not scanned</span>;

    if (unresolvedFindings) {
      return (
        <Badge variant="warning">
          <AlertTriangleIcon />
          {unresolvedFindings} {unresolvedFindings === 1 ? "Finding" : "Findings"}
        </Badge>
      );
    }

    return (
      <Badge variant="success">
        <CheckIcon />
        No Secrets Detected
      </Badge>
    );
  };

  return (
    <TableRow linked>
      <TableCell isTruncatable>
        <RowLink {...findingsLink}>{name}</RowLink>
      </TableCell>
      <TableCell>{renderStatus()}</TableCell>
      <TableCell>
        {lastScannedAt ? (
          formatDistanceToNowStrict(new Date(lastScannedAt), { addSuffix: true })
        ) : (
          <span className="text-muted">Never</span>
        )}
      </TableCell>
      <TableCell variant="action">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label={`${resourceDetails.singularTitle} options`}
              variant="ghost"
              size="sm"
            >
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyId}>
              <CopyIcon />
              Copy {resourceDetails.singularTitle} ID
            </DropdownMenuItem>
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem
                  isDisabled={!isAllowed || dataSource.isDisconnected}
                  onClick={handleTriggerScan}
                >
                  <ScanSearchIcon />
                  Trigger Scan
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
            {canRemove && (
              <ProjectPermissionCan
                I={ProjectPermissionSecretScanningDataSourceActions.Edit}
                a={ProjectPermissionSub.SecretScanningDataSources}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    variant="danger"
                    isDisabled={!isAllowed}
                    onClick={() => setIsRemoveOpen(true)}
                  >
                    <TrashIcon />
                    Remove {resourceDetails.singularTitle}
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog open={isRemoveOpen} onOpenChange={setIsRemoveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This {resourceDetails.singularNoun} won&apos;t be scanned anymore, and its scans and
                findings are permanently deleted.
                {dataSource.isDiscoveryEnabled &&
                  " Discovery is on, so it's added back the next time someone pushes to it."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel isDisabled={removeResource.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="danger"
                isPending={removeResource.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  handleRemove();
                }}
              >
                Remove {resourceDetails.singularTitle}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
};
