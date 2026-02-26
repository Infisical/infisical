import { useCallback, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloudIcon,
  CopyIcon,
  DollarSignIcon,
  PackageIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Skeleton,
  UnstableCard,
  UnstableCardContent,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useInfraFiles, useInfraGraph, useInfraResources, useInfraRuns } from "@app/hooks/api/infra";
import { TAiInsight, TInfraResource } from "@app/hooks/api/infra/types";

import { AttributesPanel, ResourceDetailPanel } from "../components/ResourceDetailPanel";
import { ResourceTopologyGraph } from "../components/ResourceTopologyGraph";

const ResourceRow = ({
  resource,
  costMap,
  isSelected,
  onSelect
}: {
  resource: TInfraResource;
  costMap: Record<string, string>;
  isSelected: boolean;
  onSelect: (address: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleCopyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(resource.address);
  };

  return (
    <>
      <UnstableTableRow
        className={`cursor-pointer transition-colors hover:bg-mineshaft-700/30 ${isSelected ? "bg-primary/5" : ""}`}
        onClick={() => onSelect(resource.address)}
      >
        <UnstableTableCell className="w-8">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
          >
            {expanded ? (
              <ChevronDownIcon className="size-4 text-mineshaft-400" />
            ) : (
              <ChevronRightIcon className="size-4 text-mineshaft-400" />
            )}
          </button>
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
            <button
              type="button"
              onClick={handleCopyAddress}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
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
            <div className="py-3">
              <h4 className="mb-2 text-xs font-medium text-mineshaft-300">Attributes</h4>
              <AttributesPanel attributes={resource.attributes ?? {}} />
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
  const { data: graph } = useInfraGraph(currentProject.id);
  const { data: runs } = useInfraRuns(currentProject.id);
  const { data: files } = useInfraFiles(currentProject.id);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

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

  // Build a resource lookup by address
  const resourceMap = useMemo(() => {
    if (!resources) return new Map<string, TInfraResource>();
    const map = new Map<string, TInfraResource>();
    for (const r of resources) {
      map.set(r.address, r);
    }
    return map;
  }, [resources]);

  const selectedResource = selectedNodeId ? (resourceMap.get(selectedNodeId) ?? null) : null;

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    setFullscreen((prev) => !prev);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const providerCounts = (resources ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.provider] = (acc[r.provider] || 0) + 1;
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!resources || resources.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-mineshaft-100">Resources</h1>
          <p className="mt-1 text-sm text-mineshaft-400">0 resources managed by OpenTofu.</p>
        </div>
        <UnstableCard>
          <UnstableCardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <PackageIcon className="size-8 text-mineshaft-500" />
            <div>
              <p className="text-sm font-medium text-mineshaft-300">No resources yet</p>
              <p className="mt-1 text-xs text-mineshaft-500">
                Resources will appear here after your first successful apply.
              </p>
            </div>
          </UnstableCardContent>
        </UnstableCard>
      </div>
    );
  }

  const graphNodes =
    graph && graph.nodes.length > 0
      ? graph.nodes
      : resources.map((r) => ({
          id: r.address,
          type: r.type,
          name: r.name,
          provider: r.provider
        }));

  const graphEdges =
    graph && graph.nodes.length > 0
      ? graph.edges
      : resources.flatMap((r) =>
          (r.dependsOn ?? [])
            .filter((dep) => resourceMap.has(dep))
            .map((dep) => ({ source: dep, target: r.address }))
        );

  // Fullscreen overlay
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex bg-bunker-800">
        <div className="min-w-0 flex-1">
          <ResourceTopologyGraph
            nodes={graphNodes}
            edges={graphEdges}
            className={twMerge("h-full", selectedResource && "rounded-r-none border-r-0")}
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedNodeId}
            fullscreen
            onToggleFullscreen={handleToggleFullscreen}
          />
        </div>
        {selectedResource && (
          <ResourceDetailPanel
            resource={selectedResource}
            costMap={costMap}
            onClose={handleCloseDetail}
            files={files}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-mineshaft-100">Resources</h1>
          <p className="mt-1 text-sm text-mineshaft-400">
            {resources.length} resources managed by OpenTofu. Click a node to inspect.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(providerCounts).map(([provider, count]) => (
            <Badge key={provider} variant="neutral">
              <CloudIcon className="size-3" />
              {provider}: {count}
            </Badge>
          ))}
        </div>
      </div>

      {/* Graph + Detail panel */}
      <div className="flex h-[500px] overflow-hidden rounded-lg border border-mineshaft-600">
        <div className="min-w-0 flex-1">
          <ResourceTopologyGraph
            nodes={graphNodes}
            edges={graphEdges}
            className={twMerge("h-full", selectedResource && "rounded-r-none border-r-0")}
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedNodeId}
            fullscreen={false}
            onToggleFullscreen={handleToggleFullscreen}
          />
        </div>
        {selectedResource && (
          <ResourceDetailPanel
            resource={selectedResource}
            costMap={costMap}
            onClose={handleCloseDetail}
            files={files}
          />
        )}
      </div>

      {/* Resources table */}
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
            <ResourceRow
              key={r.address}
              resource={r}
              costMap={costMap}
              isSelected={r.address === selectedNodeId}
              onSelect={handleNodeClick}
            />
          ))}
        </UnstableTableBody>
      </UnstableTable>
    </div>
  );
};
