import { Helmet } from "react-helmet";
import { Link, useParams } from "@tanstack/react-router";
import {
  BotIcon,
  ChevronLeftIcon,
  KeyRoundIcon,
  PlayIcon,
  ServerIcon,
  SquareIcon,
  TerminalIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton
} from "@app/components/v3";
import {
  SandboxKind,
  SandboxStatus,
  useGetSandboxById,
  useSetSandboxPower
} from "@app/hooks/api/sandboxes";

import { SandboxTerminal } from "./components/SandboxTerminal";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs tracking-wide text-label uppercase">{label}</p>
    <p className="mt-0.5 text-sm">{value}</p>
  </div>
);

export const SandboxPage = () => {
  const { orgId, sandboxId } = useParams({ strict: false }) as {
    orgId: string;
    sandboxId: string;
  };

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
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <Skeleton className="h-96" />
      </div>
    );
  }

  // The list page is the only way back from a sandbox that was deleted elsewhere, so say so rather
  // than rendering an empty page.
  if (isError || !sandbox) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <Alert variant="danger">
          <AlertTitle>Sandbox unavailable</AlertTitle>
          <AlertDescription>
            This sandbox could not be loaded. It may have been deleted, or you may not have access
            to it.
          </AlertDescription>
        </Alert>
        <Link
          to="/organizations/$orgId/sandboxes"
          params={{ orgId }}
          className="mt-4 flex w-fit items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3.5" />
          All sandboxes
        </Link>
      </div>
    );
  }

  const grantCount =
    sandbox.grants.pamAccountIds.length +
    sandbox.grants.proxiedServiceIds.length +
    sandbox.grants.clis.length;

  return (
    <>
      <Helmet>
        <title>{sandbox.name}</title>
      </Helmet>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
        <Link
          to="/organizations/$orgId/sandboxes"
          params={{ orgId }}
          className="flex w-fit items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3.5" />
          All sandboxes
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {sandbox.kind === SandboxKind.Agent ? (
                <BotIcon className="size-5 sandbox-chrome-icon" />
              ) : (
                <ServerIcon className="size-5 text-muted" />
              )}
              <h1 className="sandbox-chrome-text text-2xl font-semibold">{sandbox.name}</h1>
              <Badge variant={isRunning ? "success" : "neutral"}>
                {isRunning ? "Running" : "Stopped"}
              </Badge>
            </div>
            {sandbox.description && (
              <p className="mt-1 text-sm text-muted">{sandbox.description}</p>
            )}
          </div>

          <Button
            variant={isRunning ? "danger" : "success"}
            onClick={handlePower}
            isPending={setPower.isPending}
          >
            {isRunning ? <SquareIcon className="size-4" /> : <PlayIcon className="size-4" />}
            {isRunning ? "Stop" : "Start"}
          </Button>
        </div>

        <Card className="gap-4">
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Template" value={sandbox.template} />
            <Stat label="Size" value={`${sandbox.vcpu} vCPU · ${sandbox.memoryMb / 1024} GB`} />
            <Stat label="Commands run" value={String(sandbox.commandsRun)} />
            <Stat
              label="Grants"
              value={grantCount === 0 ? "None yet" : `${grantCount} resources`}
            />
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-accent">
              <KeyRoundIcon className="size-4" />
              Granted Resources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted">
              PAM accounts, proxied services and CLIs the sandbox may reach. Credentials are
              brokered at the boundary, so nothing granted here is ever readable inside the sandbox.
            </p>
            <p className="mt-2 text-xs text-muted">No resources granted yet.</p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-accent">
            <TerminalIcon className="size-4" />
            Shell
          </h2>
          <SandboxTerminal
            sandboxId={sandbox.id}
            sandboxName={sandbox.name}
            isRunning={isRunning}
          />
        </div>
      </div>
    </>
  );
};
