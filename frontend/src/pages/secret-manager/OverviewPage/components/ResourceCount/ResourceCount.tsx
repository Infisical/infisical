import {
  ArrowRightLeftIcon,
  FingerprintIcon,
  FolderIcon,
  ImportIcon,
  KeyIcon,
  RefreshCwIcon
} from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  folderCount?: number;
  importCount?: number;
  secretCount?: number;
  dynamicSecretCount?: number;
  secretRotationCount?: number;
  proxiedServiceCount?: number;
};

export function ResourceCount({
  folderCount = 0,
  dynamicSecretCount = 0,
  secretCount = 0,
  importCount = 0,
  secretRotationCount = 0,
  proxiedServiceCount = 0
}: Props) {
  return (
    <div className="flex items-center divide-x divide-border text-sm text-accent [&>*]:pr-2">
      {importCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <ImportIcon className="size-4 text-import" />
              <span>{importCount}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Total import count matching filters</TooltipContent>
        </Tooltip>
      )}
      {folderCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="ml-2.5 flex items-center gap-2">
              <FolderIcon className="size-4 text-folder" />
              <span>{folderCount}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Total folder count matching filters</TooltipContent>
        </Tooltip>
      )}
      {dynamicSecretCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="ml-2.5 flex items-center gap-2">
              <FingerprintIcon className="size-4 text-dynamic-secret" />
              <span>{dynamicSecretCount}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Total dynamic secret count matching filters</TooltipContent>
        </Tooltip>
      )}
      {secretRotationCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="ml-2.5 flex items-center gap-2">
              <RefreshCwIcon className="size-4 text-secret-rotation" />
              <span>{secretRotationCount}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Total secret rotation count matching filters</TooltipContent>
        </Tooltip>
      )}
      {proxiedServiceCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="ml-2.5 flex items-center gap-2">
              <ArrowRightLeftIcon className="size-4 text-proxied-service" />
              <span>{proxiedServiceCount}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Total proxied service count matching filters</TooltipContent>
        </Tooltip>
      )}
      {secretCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="ml-2.5 flex items-center gap-2">
              <KeyIcon className="size-4 text-secret" />
              <span>{secretCount}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Total secret count matching filters</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
