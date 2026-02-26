import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, CloudIcon, CopyIcon, DollarSignIcon, PackageIcon } from "lucide-react";

import {
  Badge,
  Skeleton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useInfraResources, useInfraRuns } from "@app/hooks/api/infra";
import { TAiInsight, TInfraResource } from "@app/hooks/api/infra/types";

const AttributesPanel = ({ attributes }: { attributes: Record<string, unknown> }) => {
  const entries = Object.entries(attributes).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );

  if (entries.length === 0) {
    return <span className="text-xs text-mineshaft-500">No attributes</span>;
  }

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 py-2 text-xs">
      {entries.slice(0, 20).map(([key, val]) => (
        <div key={key} className="contents">
          <span className="font-mono text-mineshaft-400">{key}</span>
          <span className="truncate font-mono text-mineshaft-200">
            {typeof val === "object" ? JSON.stringify(val) : String(val)}
          </span>
        </div>
      ))}
      {entries.length > 20 && (
        <span className="col-span-2 text-mineshaft-500">
          +{entries.length - 20} more attributes
        </span>
      )}
    </div>
  );
};

const ResourceRow = ({ resource, costMap }: { resource: TInfraResource; costMap: Record<string, string> }) => {
  const [expanded, setExpanded] = useState(false);

  const handleCopyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(resource.address);
  };

  return (
    <>
      <UnstableTableRow
        className="cursor-pointer transition-colors hover:bg-mineshaft-700/30"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <UnstableTableCell className="w-8">
          {expanded ? (
            <ChevronDownIcon className="size-4 text-mineshaft-400" />
          ) : (
            <ChevronRightIcon className="size-4 text-mineshaft-400" />
          )}
        </UnstableTableCell>
        <UnstableTableCell className="font-mono text-xs text-primary">
          {resource.type}
        </UnstableTableCell>
        <UnstableTableCell className="font-medium">{resource.name}</UnstableTableCell>
        <UnstableTableCell>
          <Badge variant="neutral">
            <CloudIcon className="size-3" />
            {resource.provider}
          </Badge>
        </UnstableTableCell>
        <UnstableTableCell>
          <span className="group flex items-center gap-1.5 font-mono text-xs text-mineshaft-400">
            {resource.address}
            <button type="button" onClick={handleCopyAddress} className="opacity-0 transition-opacity group-hover:opacity-100">
              <CopyIcon className="size-3 text-mineshaft-500 hover:text-mineshaft-300" />
            </button>
          </span>
        </UnstableTableCell>
        <UnstableTableCell>
          {costMap[resource.address] ? (
            <Badge variant="neutral">
              <DollarSignIcon className="size-3" />
              {costMap[resource.address]}/mo
            </Badge>
          ) : (
            <span className="text-xs text-mineshaft-600">—</span>
          )}
        </UnstableTableCell>
      </UnstableTableRow>
      {expanded && (
        <UnstableTableRow>
          <UnstableTableCell />
          <UnstableTableCell colSpan={5}>
            <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800/50 px-4 py-3">
              <h4 className="mb-2 text-xs font-medium text-mineshaft-300">Attributes</h4>
              <AttributesPanel attributes={resource.attributes} />
            </div>
          </UnstableTableCell>
        </UnstableTableRow>
      )}
    </>
  );
};

export const InfraResourcesPage = () => {
  const { currentProject } = useProject();
  const { data: resources, isLoading } = useInfraResources(currentProject.id);
  const { data: runs } = useInfraRuns(currentProject.id);

  // Build cost map from latest run's aiSummary
  const costMap = useMemo<Record<string, string>>(() => {
    if (!runs) return {};
    const runWithCost = runs.find((r) => r.aiSummary);
    if (!runWithCost?.aiSummary) return {};
    try {
      const insight = JSON.parse(runWithCost.aiSummary) as TAiInsight;
      const map: Record<string, string> = {};
      for (const c of [...insight.costs.estimated, ...insight.costs.aiEstimated]) {
        if (c.monthlyCost && c.monthlyCost !== "$0.00") {
          map[c.resource] = c.monthlyCost;
        }
      }
      return map;
    } catch {
      return {};
    }
  }, [runs]);

  const providerCounts = (resources ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.provider] = (acc[r.provider] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-mineshaft-100">Resources</h1>
          <p className="mt-1 text-sm text-mineshaft-400">
            {isLoading
              ? "Loading..."
              : `${resources?.length ?? 0} resources managed by OpenTofu.`}
          </p>
        </div>
        {!isLoading && resources && resources.length > 0 && (
          <div className="flex items-center gap-2">
            {Object.entries(providerCounts).map(([provider, count]) => (
              <Badge key={provider} variant="neutral">
                <CloudIcon className="size-3" />
                {provider}: {count}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !resources || resources.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-mineshaft-600 p-12 text-center">
          <PackageIcon className="size-10 text-mineshaft-500" />
          <div>
            <p className="text-sm font-medium text-mineshaft-300">No resources yet</p>
            <p className="mt-1 text-xs text-mineshaft-500">
              Resources will appear here after your first successful apply.
            </p>
          </div>
        </div>
      ) : (
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead className="w-8" />
              <UnstableTableHead>Type</UnstableTableHead>
              <UnstableTableHead>Name</UnstableTableHead>
              <UnstableTableHead>Provider</UnstableTableHead>
              <UnstableTableHead>Address</UnstableTableHead>
              <UnstableTableHead>Cost</UnstableTableHead>
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {resources.map((r) => (
              <ResourceRow key={r.address} resource={r} costMap={costMap} />
            ))}
          </UnstableTableBody>
        </UnstableTable>
      )}
    </div>
  );
};
