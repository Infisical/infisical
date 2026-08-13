import { useState } from "react";
import { Helmet } from "react-helmet";
import { useNavigate } from "@tanstack/react-router";
import { BoxIcon, KeyRoundIcon, MemoryStickIcon, PlugIcon, PlusIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageHeader,
  Skeleton
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { SandboxStatus, useListSandboxes } from "@app/hooks/api/sandboxes";

import { Sparkline } from "../components/charts";
import { AGENT_ICONS } from "../SandboxPage/components/agentIcons";
import { CreateSandboxWizard } from "./components/CreateSandboxWizard";

/** Stable identity: a new [] each render reads as a new sample and restarts the sparkline's clock. */
const NO_SAMPLES: number[] = [];

export const SandboxesPage = () => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { data: sandboxes, isPending, isError } = useListSandboxes();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const running = sandboxes?.filter((s) => s.status === SandboxStatus.Running).length ?? 0;

  return (
    <>
      <Helmet>
        <title>Sandboxes</title>
      </Helmet>

      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.Sandbox}
          title={<span className="sandbox-chrome-text">Sandbox</span>}
          description="Isolated environments for AI agents and untrusted code. Credentials stay outside the boundary."
        >
          <Button variant="project" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon />
            Create Sandbox
          </Button>
        </PageHeader>

        {isPending && <Skeleton className="h-64" />}

        {isError && (
          <Alert variant="danger">
            <AlertTitle>Could not load sandboxes</AlertTitle>
            <AlertDescription>Refresh the page to try again.</AlertDescription>
          </Alert>
        )}

        {sandboxes && sandboxes.length === 0 && (
          <Empty frame="dashed">
            <EmptyHeader>
              <EmptyMedia>
                <BoxIcon />
              </EmptyMedia>
              <EmptyTitle>No sandboxes yet</EmptyTitle>
              <EmptyDescription>
                Create a sandbox to give an agent a place to work without handing it credentials.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="project" onClick={() => setIsCreateOpen(true)}>
                <PlusIcon className="size-4" />
                Create Sandbox
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {sandboxes && sandboxes.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">
              {sandboxes.length} sandbox{sandboxes.length === 1 ? "" : "es"} · {running} running
            </p>

            {/* Padded because the layout's scroll container clips on both axes with no padding of
                its own, so a card on an edge loses the corner it grows into on hover. */}
            <div className="grid grid-cols-1 gap-5 p-1 md:grid-cols-2 xl:grid-cols-3">
              {sandboxes.map((sandbox) => {
                const isRunning = sandbox.status === SandboxStatus.Running;
                // The icon says what the sandbox is. A plain VM has no agent, so it keeps the box.
                const Icon = sandbox.agentType ? AGENT_ICONS[sandbox.agentType] : BoxIcon;
                const open = () =>
                  navigate({
                    to: "/organizations/$orgId/sandboxes/$sandboxId",
                    params: { orgId: currentOrg.id, sandboxId: sandbox.id }
                  });

                const stats = [
                  {
                    icon: MemoryStickIcon,
                    label: `${sandbox.vcpu} vCPU · ${sandbox.memoryMb / 1024} GB`
                  },
                  {
                    icon: PlugIcon,
                    label: `${sandbox.grants.integrations.length} endpoint${
                      sandbox.grants.integrations.length === 1 ? "" : "s"
                    }`
                  },
                  {
                    icon: KeyRoundIcon,
                    label: `${sandbox.grants.pamAccountIds.length} account${
                      sandbox.grants.pamAccountIds.length === 1 ? "" : "s"
                    }`
                  }
                ];

                return (
                  <Card
                    key={sandbox.id}
                    role="button"
                    tabIndex={0}
                    onClick={open}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") open();
                    }}
                    // Lifted on hover because the scale grows the card past its grid cell, and
                    // without a stacking order the next card in the DOM paints over the new edge.
                    className="group relative h-full cursor-pointer rounded-md transition-all duration-200 ease-out hover:z-10 hover:scale-[1.01] hover:bg-gradient-to-br hover:from-product-sandbox/[0.05] hover:to-transparent"
                  >
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 rounded-sm border border-product-sandbox/25 bg-gradient-to-br from-product-sandbox/15 to-product-sandbox/5 p-1.5 transition-colors duration-200 group-hover:border-product-sandbox/45 group-hover:from-product-sandbox/25 group-hover:to-product-sandbox/10">
                          <Icon className="h-4.5 w-4.5 sandbox-chrome-icon" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-base font-semibold text-foreground underline decoration-product-sandbox/60 decoration-[1.5px] underline-offset-4">
                              {sandbox.name}
                            </span>
                            <Badge variant={isRunning ? "success" : "neutral"}>
                              {isRunning ? "Running" : "Stopped"}
                            </Badge>

                            {/* Fixed width and pushed right, so appearing on start cannot reflow
                                the name or the badge beside it. */}
                            {isRunning && (
                              <Sparkline
                                values={sandbox.metrics?.series ?? NO_SAMPLES}
                                isEmphasised
                                gradientId={`spark-${sandbox.id}`}
                                className="ml-auto h-5 w-16 shrink-0 sandbox-chrome-fade"
                              />
                            )}
                          </div>
                          {/* Dimmed when absent rather than omitted: without a line here the card
                              collapses and the grid rows stop lining up. */}
                          <p
                            className={`mt-1 line-clamp-2 text-sm leading-relaxed ${
                              sandbox.description ? "text-accent" : "text-muted/60 italic"
                            }`}
                          >
                            {sandbox.description || "No description"}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="mt-auto flex flex-col gap-3">
                      <div className="flex items-center gap-4 border-t border-border pt-3">
                        {stats.map((stat, index) => (
                          <div key={stat.label} className="flex items-center gap-4">
                            {/* nowrap: the wider plural labels broke onto a second line on some
                                cards and not others, which knocked the three stats out of line. */}
                            <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted">
                              <stat.icon className="size-3.5 shrink-0" />
                              {stat.label}
                            </span>
                            {index < stats.length - 1 && <div className="h-4 w-px bg-border" />}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <CreateSandboxWizard
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(sandboxId) =>
          navigate({
            to: "/organizations/$orgId/sandboxes/$sandboxId",
            params: { orgId: currentOrg.id, sandboxId }
          })
        }
      />
    </>
  );
};
