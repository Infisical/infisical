import { ReactNode } from "react";
import { ActivityIcon, BotIcon, CpuIcon, KeyRoundIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Separator
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { SandboxStatus, TSandbox } from "@app/hooks/api/sandboxes";

type TStatVariant = "project" | "info" | "neutral";

const StatCard = ({
  title,
  icon,
  iconVariant,
  value,
  subtitle,
  footnote,
  footnoteVariant
}: {
  title: string;
  icon: ReactNode;
  iconVariant: TStatVariant;
  value: string | number;
  subtitle: string;
  footnote: string;
  footnoteVariant: "project" | "neutral" | "success";
}) => (
  <Card className="flex-1 gap-4">
    {/* Force the two-column header: CardHeader only splits at its @xs container width, and four
        cards in a row are narrower than that, which drops the icon onto its own line. */}
    <CardHeader className="grid-cols-[1fr_auto]">
      <CardTitle className="text-sm font-medium text-accent">{title}</CardTitle>
      <CardAction>
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-md border [&>svg]:size-5",
            iconVariant === "project" && "border-project/15 bg-project/10 text-project",
            iconVariant === "info" && "border-info/15 bg-info/10 text-info",
            iconVariant === "neutral" && "border-neutral/15 bg-neutral/10 text-neutral"
          )}
        >
          {icon}
        </div>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div>
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        <span className="ml-2 text-sm text-muted">{subtitle}</span>
      </div>
      <Separator />
      <Badge variant={footnoteVariant} className="no-underline">
        {footnote}
      </Badge>
    </CardContent>
  </Card>
);

export const OverviewTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const isRunning = sandbox.status === SandboxStatus.Running;
  const { integrations, pamAccountIds } = sandbox.grants;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 xl:flex-row">
        <StatCard
          title="Resources"
          icon={<CpuIcon />}
          iconVariant="neutral"
          value={sandbox.vcpu}
          subtitle={`vCPU · ${sandbox.memoryMb / 1024} GB memory`}
          footnote={isRunning ? "Running" : "Stopped"}
          footnoteVariant={isRunning ? "success" : "neutral"}
        />
        <StatCard
          title="Granted Access"
          icon={<KeyRoundIcon />}
          iconVariant="project"
          value={integrations.length + pamAccountIds.length}
          subtitle="resources reachable"
          footnote={
            integrations.length + pamAccountIds.length === 0
              ? "Nothing granted yet"
              : `${integrations.length} integrations · ${pamAccountIds.length} PAM`
          }
          footnoteVariant={integrations.length + pamAccountIds.length === 0 ? "neutral" : "project"}
        />
        <StatCard
          title="Agent"
          icon={<BotIcon />}
          iconVariant="info"
          value={sandbox.agentType ?? "None"}
          subtitle={sandbox.agentType ? "configured" : "not configured"}
          footnote={sandbox.hasAgentToken ? "API key stored" : "No API key"}
          footnoteVariant={sandbox.hasAgentToken ? "success" : "neutral"}
        />
        <StatCard
          title="Activity"
          icon={<ActivityIcon />}
          iconVariant="neutral"
          value={sandbox.commandsRun}
          subtitle="commands run"
          footnote={
            sandbox.lastActivityAt
              ? `Last used ${new Date(sandbox.lastActivityAt).toLocaleDateString()}`
              : "Never used"
          }
          footnoteVariant="neutral"
        />
      </div>
    </div>
  );
};
