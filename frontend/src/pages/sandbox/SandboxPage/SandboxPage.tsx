import { Helmet } from "react-helmet";
import { useParams, useSearch } from "@tanstack/react-router";
import { PlayIcon, SquareIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  PageHeader,
  Skeleton
} from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import { SandboxStatus, useGetSandboxById, useSetSandboxPower } from "@app/hooks/api/sandboxes";

import { AgentTab, IntegrationsTab, OverviewTab, PamAccountsTab } from "./components";

export enum SandboxTab {
  Overview = "overview",
  Integrations = "integrations",
  Pam = "pam",
  Agent = "agent"
}

export const SandboxPage = () => {
  const { sandboxId } = useParams({ strict: false }) as { sandboxId: string };
  const tab = useSearch({ strict: false, select: (el) => el.selectedTab }) ?? SandboxTab.Overview;

  const { data: sandbox, isPending, isError } = useGetSandboxById(sandboxId);
  const setPower = useSetSandboxPower();

  const isRunning = sandbox?.status === SandboxStatus.Running;

  const handlePower = async () => {
    if (!sandbox) return;

    const action = isRunning ? "stop" : "start";
    await setPower.mutateAsync({ sandboxId: sandbox.id, action });
    createNotification({
      type: "success",
      text: action === "start" ? "Sandbox started" : "Sandbox stopped"
    });
  };

  if (isPending) {
    return (
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  // A sandbox deleted from another tab is the common way to land here, so name it rather than
  // rendering an empty page.
  if (isError || !sandbox) {
    return (
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <div>
          <Alert variant="danger">
            <AlertTitle>Sandbox unavailable</AlertTitle>
            <AlertDescription>
              This sandbox could not be loaded. It may have been deleted, or you may not have access
              to it.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{sandbox.name}</title>
      </Helmet>

      <div className="mx-auto mb-6 w-full max-w-8xl">
        <div>
          <PageHeader
            scope={ProjectType.Sandbox}
            title={
              // PageHeader underlines its h1, and text decoration propagates from an ancestor: a
              // descendant cannot switch it off. An inline-flex box is atomic, so the line is not
              // drawn through it, which lets the name opt back in on its own.
              <span className="inline-flex items-center gap-3 align-middle">
                <span className="underline decoration-project/90 underline-offset-4">
                  {sandbox.name}
                </span>
                <Badge variant={isRunning ? "success" : "neutral"}>
                  {isRunning ? "Running" : "Stopped"}
                </Badge>
              </span>
            }
            description={
              sandbox.description ?? "An isolated environment for agents and untrusted code."
            }
          >
            {tab === SandboxTab.Overview && (
              <Button
                variant={isRunning ? "danger" : "project"}
                onClick={handlePower}
                isPending={setPower.isPending}
              >
                {isRunning ? <SquareIcon /> : <PlayIcon />}
                {isRunning ? "Stop" : "Start"}
              </Button>
            )}
          </PageHeader>

          <div className="mt-4">
            {tab === SandboxTab.Integrations && <IntegrationsTab sandbox={sandbox} />}
            {tab === SandboxTab.Pam && <PamAccountsTab sandbox={sandbox} />}
            {tab === SandboxTab.Agent && <AgentTab sandbox={sandbox} />}
            {tab === SandboxTab.Overview && <OverviewTab sandbox={sandbox} />}
          </div>
        </div>
      </div>
    </>
  );
};
