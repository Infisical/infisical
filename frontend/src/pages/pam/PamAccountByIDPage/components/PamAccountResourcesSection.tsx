import { MonitorIcon } from "lucide-react";

import { TPamAccount } from "@app/hooks/api/pam";

type Props = {
  account: TPamAccount;
  onAccessResource: (resourceId: string) => void;
};

type ResourceCardProps = {
  name: string;
  resourceId: string;
  onAccess: (resourceId: string) => void;
};

const ResourceCard = ({ name, resourceId, onAccess }: ResourceCardProps) => {
  return (
    <button
      type="button"
      onClick={() => onAccess(resourceId)}
      className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-border bg-container p-4 text-left transition-colors hover:border-foreground/20 hover:bg-container-hover"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/5">
          <MonitorIcon className="size-5 text-muted" />
        </div>
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted">{resourceId.slice(0, 8)}</p>
        </div>
      </div>
    </button>
  );
};

export const PamAccountResourcesSection = ({ account, onAccessResource }: Props) => {
  const { resource } = account;

  return (
    <div className="rounded-lg border border-border bg-container">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-lg font-medium">Resources</h3>
        <p className="text-sm text-muted">Resources this account can access</p>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ResourceCard name={resource.name} resourceId={resource.id} onAccess={onAccessResource} />
        </div>
      </div>
    </div>
  );
};
