import type { ComponentProps } from "react";

import { CardHeader } from "@app/components/v3";

import type { createOverviewTelemetry } from "../../OverviewTelemetry";
import { AddResourceButtons, AddResourceButtonsProps } from "../AddResourceButtons/AddResourceButtons";
import { DownloadEnvButton } from "../DownloadEnvButton";
import { EnvironmentSelect } from "../EnvironmentSelect";
import { ResourceFilter } from "../ResourceFilter";
import { ResourceSearchInput } from "../ResourceSearchInput";

type Props = {
  overviewTelemetry: ReturnType<typeof createOverviewTelemetry>;
  projectId: string;
  secretPath: string;
  userAvailableEnvs: ComponentProps<typeof ResourceSearchInput>["environments"];
  visibleEnvs: ComponentProps<typeof DownloadEnvButton>["environments"];
  selectedEnvs: ComponentProps<typeof EnvironmentSelect>["selectedEnvs"];
  onSelectedEnvsChange: ComponentProps<typeof EnvironmentSelect>["setSelectedEnvs"];
  onUpgradePlan: ComponentProps<typeof EnvironmentSelect>["onUpgradePlan"];
  isEnvironmentSelectDisabled: boolean;
  searchFilter: string;
  onSearchFilterChange: (value: string) => void;
  tags: ComponentProps<typeof ResourceSearchInput>["tags"];
  isSearchAllFoldersOpen: boolean;
  onSearchAllFoldersOpenChange: (isOpen: boolean) => void;
  resourceFilterProps: ComponentProps<typeof ResourceFilter>;
  addResourceButtonsProps: AddResourceButtonsProps;
};

export const OverviewToolbar = ({
  overviewTelemetry,
  projectId,
  secretPath,
  userAvailableEnvs,
  visibleEnvs,
  selectedEnvs,
  onSelectedEnvsChange,
  onUpgradePlan,
  isEnvironmentSelectDisabled,
  searchFilter,
  onSearchFilterChange,
  tags,
  isSearchAllFoldersOpen,
  onSearchAllFoldersOpenChange,
  resourceFilterProps,
  addResourceButtonsProps
}: Props) => (
  <CardHeader className="min-w-0">
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 @min-[48rem]/card-header:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className="col-start-1 row-start-1 min-w-0">
        <EnvironmentSelect
          selectedEnvs={selectedEnvs}
          setSelectedEnvs={(value) => {
            overviewTelemetry.interaction({
              action: "environment-selection",
              source: "header"
            });
            onSelectedEnvsChange(value);
          }}
          onUpgradePlan={onUpgradePlan}
          isDisabled={isEnvironmentSelectDisabled}
        />
      </div>
      <div
        className={`col-span-2 flex min-w-0 items-center gap-2 @min-[48rem]/card-header:col-span-1 @min-[48rem]/card-header:col-start-2 @min-[48rem]/card-header:row-start-1 ${
          userAvailableEnvs.length > 0
            ? "row-start-3 @min-[15rem]/card-header:row-start-2"
            : "row-start-2"
        }`}
      >
        <ResourceSearchInput
          key={secretPath}
          className="min-w-0 flex-1"
          value={searchFilter}
          tags={tags}
          onChange={(value) => {
            if (Boolean(value.trim()) !== Boolean(searchFilter.trim()))
              overviewTelemetry.interaction({
                action: value.trim() ? "search-started" : "search-cleared",
                source: "search"
              });
            onSearchFilterChange(value);
          }}
          onSelectResult={({ search }) => {
            if (search.trim() && !searchFilter.trim())
              overviewTelemetry.interaction({ action: "search-started", source: "search" });
            onSearchFilterChange(search);
          }}
          isSearchAllFoldersOpen={isSearchAllFoldersOpen}
          onSearchAllFoldersOpenChange={(isOpen) => {
            if (isOpen && !isSearchAllFoldersOpen)
              overviewTelemetry.interaction({
                action: "search-all-folders",
                source: "search"
              });
            onSearchAllFoldersOpenChange(isOpen);
          }}
          environments={userAvailableEnvs}
          projectId={projectId}
        />
        {userAvailableEnvs.length > 0 && (
          <>
            <ResourceFilter {...resourceFilterProps} />
            <DownloadEnvButton
              secretPath={secretPath}
              environments={visibleEnvs}
              projectId={projectId}
            />
          </>
        )}
      </div>
      {userAvailableEnvs.length > 0 && (
        <div className="col-start-2 row-start-2 justify-self-end @min-[15rem]/card-header:row-start-1 @min-[48rem]/card-header:col-start-3">
          <AddResourceButtons {...addResourceButtonsProps} />
        </div>
      )}
    </div>
  </CardHeader>
);
