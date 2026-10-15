import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { CopyIcon, MoreHorizontalIcon, PencilIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretScanningScanStatusBadge } from "@app/components/secret-scanning";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  ProviderIcon,
  TableCell,
  TableRow
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import {
  SecretScanningScanStatus,
  TSecretScanningDataSourceWithDetails
} from "@app/hooks/api/secretScanningV2";

import { DataSourceStatusBadge } from "../../components/DataSourceStatusBadge";

type Props = {
  dataSource: TSecretScanningDataSourceWithDetails;
  onDelete: (dataSource: TSecretScanningDataSourceWithDetails) => void;
  onEdit: (dataSource: TSecretScanningDataSourceWithDetails) => void;
};

export const SecretScanningDataSourceRow = ({ dataSource, onDelete, onEdit }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const {
    id,
    name,
    description,
    type,
    unresolvedFindings,
    resourceCount,
    lastScannedAt,
    lastScanStatus,
    lastScanStatusMessage
  } = dataSource;
  const sourceDetails = SECRET_SCANNING_DATA_SOURCE_MAP[type];
  const resourceDescription = RESOURCE_DESCRIPTION_HELPER[type];

  const handleCopyId = () => {
    navigator.clipboard.writeText(id);
    createNotification({ text: "Data source ID copied to clipboard", type: "info" });
  };

  const renderLastScan = () => {
    if (lastScanStatus && lastScanStatus !== SecretScanningScanStatus.Completed) {
      return (
        <SecretScanningScanStatusBadge
          status={lastScanStatus}
          statusMessage={lastScanStatusMessage}
          scannedAt={lastScannedAt}
        />
      );
    }

    if (!lastScannedAt) return <span className="text-muted">Never</span>;

    return formatDistanceToNowStrict(new Date(lastScannedAt), { addSuffix: true });
  };

  return (
    <TableRow
      onClick={() =>
        navigate({
          to: ROUTE_PATHS.SecretScanning.DataSourceByIdPage.path,
          params: { orgId: currentOrg.id, dataSourceId: id, type }
        })
      }
    >
      <TableCell>
        <div className="flex items-center gap-1.5">
          <ProviderIcon
            alt={`${sourceDetails.name} data source`}
            icon={sourceDetails.image}
            className="size-4"
          />
          {sourceDetails.name}
        </div>
      </TableCell>
      <TableCell isTruncatable>
        <p className="truncate">{name}</p>
        {description && <p className="truncate text-xs text-muted">{description}</p>}
      </TableCell>
      <TableCell>
        {resourceCount}{" "}
        {resourceCount === 1 ? resourceDescription.singularTitle : resourceDescription.pluralTitle}
      </TableCell>
      <TableCell>
        {lastScannedAt ? (
          <span className={unresolvedFindings ? "text-danger" : undefined}>
            {unresolvedFindings ?? 0}
          </span>
        ) : (
          <span className="text-muted">-</span>
        )}
      </TableCell>
      <TableCell>{renderLastScan()}</TableCell>
      <TableCell>
        <DataSourceStatusBadge dataSource={dataSource} />
      </TableCell>
      <TableCell variant="action" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="Data source options" variant="ghost" size="sm">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyId}>
              <CopyIcon />
              Copy Data Source ID
            </DropdownMenuItem>
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.Edit}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem isDisabled={!isAllowed} onClick={() => onEdit(dataSource)}>
                  <PencilIcon />
                  Edit Data Source
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
            <DropdownMenuSeparator />
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.Delete}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem
                  isDisabled={!isAllowed}
                  variant="danger"
                  onClick={() => onDelete(dataSource)}
                >
                  <TrashIcon />
                  Delete Data Source
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
