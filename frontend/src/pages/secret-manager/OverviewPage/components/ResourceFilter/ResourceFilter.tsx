import { FilterIcon, FingerprintIcon, FolderIcon, KeyIcon, RefreshCwIcon } from "lucide-react";

import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuLabel,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
} from "@app/components/v3";
import { RowType } from "@app/pages/secret-manager/OverviewPage/OverviewPage";

type Props = {
  onToggleRowType: (resource: RowType) => void;
  rowTypeFilter: Record<RowType, boolean>;
};

export function ResourceFilter({ onToggleRowType, rowTypeFilter }: Props) {
  const filterCount = Object.values(rowTypeFilter).filter(Boolean).length;

  return (
    <UnstableDropdownMenu>
      <UnstableDropdownMenuTrigger>
        <Tooltip>
          <TooltipTrigger asChild>
            <UnstableIconButton
              className="relative"
              size="md"
              variant={filterCount ? "project" : "outline"}
            >
              <FilterIcon />
              {Boolean(filterCount) && (
                <Badge className="absolute -top-2 -right-2" isSquare>
                  {filterCount}
                </Badge>
              )}
            </UnstableIconButton>
          </TooltipTrigger>
          <TooltipContent>Filter resources</TooltipContent>
        </Tooltip>
      </UnstableDropdownMenuTrigger>
      <UnstableDropdownMenuContent align="end">
        <UnstableDropdownMenuLabel>Filter by Resource</UnstableDropdownMenuLabel>
        <UnstableDropdownMenuCheckboxItem
          onClick={(e) => {
            e.preventDefault();
            onToggleRowType(RowType.Folder);
          }}
          checked={Boolean(rowTypeFilter[RowType.Folder])}
        >
          <FolderIcon className="text-folder" />
          Folders
        </UnstableDropdownMenuCheckboxItem>
        <UnstableDropdownMenuCheckboxItem
          onClick={(e) => {
            e.preventDefault();
            onToggleRowType(RowType.DynamicSecret);
          }}
          checked={Boolean(rowTypeFilter[RowType.DynamicSecret])}
        >
          <FingerprintIcon className="text-dynamic-secret" />
          Dynamic Secrets
        </UnstableDropdownMenuCheckboxItem>
        <UnstableDropdownMenuCheckboxItem
          onClick={(e) => {
            e.preventDefault();
            onToggleRowType(RowType.SecretRotation);
          }}
          checked={rowTypeFilter[RowType.SecretRotation]}
        >
          <RefreshCwIcon className="text-secret-rotation" />
          Secret Rotations
        </UnstableDropdownMenuCheckboxItem>
        <UnstableDropdownMenuCheckboxItem
          onClick={(e) => {
            e.preventDefault();
            onToggleRowType(RowType.Secret);
          }}
          checked={Boolean(rowTypeFilter[RowType.Secret])}
        >
          <KeyIcon className="text-accent" />
          Secrets
        </UnstableDropdownMenuCheckboxItem>
      </UnstableDropdownMenuContent>
    </UnstableDropdownMenu>
  );
}
