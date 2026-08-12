import { TSandbox } from "@app/hooks/api/sandboxes";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <p className="text-xs tracking-wide text-label uppercase">{label}</p>
    <p className="mt-1 text-sm text-foreground">{value}</p>
  </div>
);

export const OverviewTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const grantCount = sandbox.grants.integrations.length + sandbox.grants.pamAccountIds.length;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat label="Size" value={`${sandbox.vcpu} vCPU · ${sandbox.memoryMb / 1024} GB`} />
      <Stat label="Commands run" value={String(sandbox.commandsRun)} />
      <Stat label="Grants" value={grantCount === 0 ? "None yet" : `${grantCount} resources`} />
      <Stat
        label="Agent"
        value={
          sandbox.agentType
            ? `${sandbox.agentType}${sandbox.hasAgentToken ? "" : " (no key)"}`
            : "Not configured"
        }
      />
    </div>
  );
};
