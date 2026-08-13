import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Edge,
  MarkerType,
  Node,
  ReactFlow,
  ReactFlowProvider
} from "@xyflow/react";
import { NetworkIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@app/components/v3";
import {
  SandboxActivityType,
  SandboxCommandKind,
  SandboxStatus,
  streamSandboxCommands,
  TSandbox,
  TSandboxActivityEntry
} from "@app/hooks/api/sandboxes";
import { useListPamAccounts } from "@app/hooks/api/pam/queries";

import { NODE_TYPES, TTopologyNodeData } from "./nodes";

/**
 * What this sandbox can reach, and what it is actually reaching right now. Laid out by hand rather
 * than by a layout engine: the shape is always sandbox, then broker, then fan out, and hand
 * placement keeps that story readable in a way a force layout would not.
 */

// Four columns: what is running, what stands in its way, the two kinds of thing it was granted, and
// each individual grant. The category column is what keeps the leaves from reading as one flat list.
const COLUMN = { sandbox: 0, broker: 290, category: 580, leaf: 880 };
const ROW_HEIGHT = 78;
/** Breathing room between one category's block of leaves and the next. */
const CATEGORY_GAP = 40;

/**
 * React Flow styles SVG strokes and its canvas with raw colour values, not classes, so the design
 * tokens are mirrored here. These must track src/index.css if the palette moves.
 */
const COLOUR = {
  info: "#63b0bd",
  success: "#2ecc71",
  border: "#2b2c30",
  canvas: "#0e1014",
  dots: "#2b2c30"
};

const edgeStyle = (isActive: boolean, colour: string) => ({
  stroke: isActive ? colour : COLOUR.border,
  strokeWidth: isActive ? 2 : 1.25
});

export const TopologyTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const [entries, setEntries] = useState<TSandboxActivityEntry[]>([]);
  const isRunning = sandbox.status === SandboxStatus.Running;

  useEffect(() => {
    if (!isRunning) {
      setEntries([]);
      return undefined;
    }

    const controller = new AbortController();
    streamSandboxCommands(
      sandbox.id,
      (entry) =>
        setEntries((prev) => (prev.some((seen) => seen.id === entry.id) ? prev : [...prev, entry])),
      controller.signal
    ).catch(() => {});

    return () => controller.abort();
  }, [sandbox.id, isRunning]);

  const integrations = sandbox.grants.integrations ?? [];
  const pamCount = (sandbox.grants.pamAccountIds ?? []).length;

  /** Counts drive both the edge emphasis and the badge, so the diagram animates itself as work happens. */
  const counts = useMemo(() => {
    const byHost = new Map<string, number>();
    let pam = 0;
    let blocked = 0;

    entries.forEach((entry) => {
      if (entry.type === SandboxActivityType.Proxy) {
        if (entry.decision === "blocked") blocked += 1;
        const host = entry.host.split(":")[0];
        byHost.set(host, (byHost.get(host) ?? 0) + 1);
        return;
      }
      if (entry.kind === SandboxCommandKind.Pam) pam += 1;
    });

    return { byHost, pam, blocked };
  }, [entries]);

  // Named from the account list rather than the brokered ports, which only exist while the sandbox
  // is running. A stopped sandbox should still show what it was granted.
  const pamAccountIds = sandbox.grants.pamAccountIds ?? [];
  const { data: pamAccounts = [] } = useListPamAccounts(undefined, {
    enabled: pamAccountIds.length > 0
  });

  const { nodes, edges } = useMemo(() => {
    const hitsFor = (hostnames: string[]) =>
      hostnames.reduce((sum, host) => sum + (counts.byHost.get(host.replace("*.", "")) ?? 0), 0);

    // Each grant is its own leaf. PAM accounts only resolve while the sandbox is running, so a
    // stopped sandbox still shows the category with the count it was granted.
    const integrationLeaves = integrations.map((integration) => ({
      id: `integration-${integration.id}`,
      parent: "integrations",
      data: {
        label: integration.type,
        sublabel: integration.hostnames.join(", "),
        count: hitsFor(integration.hostnames),
        tone: "integration" as const
      }
    }));

    const pamLeaves = pamAccountIds.map((accountId) => {
      const account = pamAccounts.find((candidate) => candidate.id === accountId);

      return {
        id: `pam-${accountId}`,
        parent: "pam",
        data: {
          label: account?.name ?? "account",
          sublabel: [account?.accountType, account?.folderName].filter(Boolean).join(" · "),
          count: 0,
          tone: "pam" as const
        }
      };
    });

    const leaves = [...integrationLeaves, ...pamLeaves];

    const categories = [
      integrations.length && {
        id: "integrations",
        data: {
          label: "Integrations",
          sublabel: `${integrations.length} brokered on the wire`,
          count: integrations.reduce((sum, i) => sum + hitsFor(i.hostnames), 0),
          tone: "integration" as const
        }
      },
      pamCount && {
        id: "pam",
        data: {
          label: "PAM accounts",
          sublabel: `${pamCount} reachable on localhost`,
          count: counts.pam,
          tone: "pam" as const
        }
      }
    ].filter(Boolean) as { id: string; data: TTopologyNodeData }[];

    // Each category owns a block of rows, and its leaves sit inside it. Deriving a category's
    // position from its leaves instead puts two categories at the same y whenever one has no leaves
    // yet, which is exactly what happens to PAM before the sandbox is running.
    const leafY: Record<string, number> = {};
    const categoryY: Record<string, number> = {};
    let cursor = 0;

    categories.forEach((category) => {
      const own = leaves.filter((leaf) => leaf.parent === category.id);

      own.forEach((leaf, index) => {
        leafY[leaf.id] = cursor + index * ROW_HEIGHT;
      });

      // A category with nothing under it still occupies a row, so the next one clears it.
      const rows = Math.max(own.length, 1);
      categoryY[category.id] = cursor + ((rows - 1) * ROW_HEIGHT) / 2;
      cursor += rows * ROW_HEIGHT + CATEGORY_GAP;
    });

    const spineY =
      categories.length > 0
        ? categories.reduce((sum, c) => sum + categoryY[c.id], 0) / categories.length
        : 0;

    const flowNodes: Node[] = [
      {
        id: "sandbox",
        type: "sandbox",
        position: { x: COLUMN.sandbox, y: spineY },
        data: {
          label: sandbox.name,
          sublabel: `${sandbox.vcpu} vCPU · ${(sandbox.memoryMb / 1024).toFixed(0)} GB`,
          tone: "sandbox"
        } satisfies TTopologyNodeData
      },
      {
        id: "broker",
        type: "topology",
        position: { x: COLUMN.broker, y: spineY },
        data: {
          label: "Credential broker",
          sublabel: counts.blocked ? `${counts.blocked} blocked` : "attaches secrets on the wire",
          count: entries.filter((entry) => entry.type === SandboxActivityType.Proxy).length,
          tone: counts.blocked ? "blocked" : "broker"
        } satisfies TTopologyNodeData
      },
      ...categories.map((category) => ({
        id: category.id,
        type: "topology",
        position: { x: COLUMN.category, y: categoryY[category.id] },
        data: category.data
      })),
      ...leaves.map((leaf) => ({
        id: leaf.id,
        type: "topology",
        position: { x: COLUMN.leaf, y: leafY[leaf.id] },
        data: leaf.data
      }))
    ];

    // No edge labels: React Flow draws them as light chips that fight the canvas, and the counts
    // they would carry are already on the node they point at. The arrow says direction, the colour
    // and animation say whether anything is flowing.
    const link = (id: string, source: string, target: string, count: number, colour: string) => {
      const isActive = count > 0;

      return {
        id,
        source,
        target,
        animated: isActive,
        style: edgeStyle(isActive, colour),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isActive ? colour : COLOUR.border,
          width: 18,
          height: 18
        }
      };
    };

    const flowEdges: Edge[] = [
      link("sandbox-broker", "sandbox", "broker", entries.length, COLOUR.info),
      ...categories.map((category) =>
        link(
          `broker-${category.id}`,
          "broker",
          category.id,
          category.data.count ?? 0,
          category.id === "pam" ? COLOUR.info : COLOUR.success
        )
      ),
      ...leaves.map((leaf) =>
        link(
          `${leaf.parent}-${leaf.id}`,
          leaf.parent,
          leaf.id,
          leaf.data.count ?? 0,
          leaf.parent === "pam" ? COLOUR.info : COLOUR.success
        )
      )
    ];

    return { nodes: flowNodes, edges: flowEdges };
  }, [integrations, pamAccountIds, pamAccounts, pamCount, counts, entries, sandbox]);

  const hasTargets = integrations.length > 0 || pamCount > 0;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Topology</CardTitle>
        <CardDescription>
          What this sandbox can reach, and what it is reaching now. Nothing leaves without passing
          through the broker, which is where the credential is attached.
        </CardDescription>
        <CardAction>
          <Badge variant={isRunning ? "success" : "neutral"}>
            {isRunning && (
              <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-current" />
            )}
            {isRunning ? "Live" : "Not running"}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent>
        {!hasTargets ? (
          <Empty frame="dashed">
            <EmptyHeader>
              <EmptyMedia>
                <NetworkIcon />
              </EmptyMedia>
              <EmptyTitle>Nothing granted yet</EmptyTitle>
              <EmptyDescription>
                Add an integration or a PAM account and it will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="h-[calc(100vh-24rem)] min-h-[320px] overflow-hidden rounded-md border border-border">
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                nodesDraggable={false}
                nodesConnectable={false}
                edgesFocusable={false}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                proOptions={{ hideAttribution: true }}
              >
                <Background color={COLOUR.dots} bgColor={COLOUR.canvas} variant={BackgroundVariant.Dots} />
              </ReactFlow>
            </ReactFlowProvider>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
