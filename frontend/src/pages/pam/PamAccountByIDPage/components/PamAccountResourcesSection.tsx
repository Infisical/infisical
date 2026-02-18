import { MonitorIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { PamResourceType, TPamAccount, useListRelatedResources } from "@app/hooks/api/pam";

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

const ActiveDirectoryAccountResources = ({ account, onAccessResource }: Props) => {
  const { resource } = account;

  // For AD accounts, show all domain member resources (excluding the AD server itself)
  const { data: relatedResources, isPending } = useListRelatedResources(resource.id);

  return (
    <div className="rounded-lg border border-border bg-container">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-lg font-medium">Resources</h3>
        <p className="text-sm text-muted">Domain machines this account can access</p>
      </div>
      <div className="p-4">
        {isPending && <p className="text-sm text-muted">Loading resources...</p>}
        {!isPending && (!relatedResources || relatedResources.length === 0) && (
          <p className="py-4 text-center text-sm text-muted">No domain resources found</p>
        )}
        {relatedResources && relatedResources.length > 0 && (
          // Temporarily disable connecting to AD accounts
          <div className="pointer-events-none grid grid-cols-1 gap-4 opacity-60 md:grid-cols-2">
            {relatedResources.map((relatedResource) => {
              return (
                <ResourceCard
                  key={relatedResource.id}
                  name={relatedResource.name}
                  resourceId={relatedResource.id}
                  onAccess={() => onAccessResource(relatedResource.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const PamAccountResourcesSection = ({ account, onAccessResource }: Props) => {
  const { resource } = account;

  // For Active Directory accounts, show related domain resources instead
  if (resource.resourceType === PamResourceType.ActiveDirectory) {
    return (
      <ActiveDirectoryAccountResources account={account} onAccessResource={onAccessResource} />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-container">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-lg font-medium">Resources</h3>
        <p className="text-sm text-muted">Resources this account can access</p>
      </div>
      <div className="p-4">
        <div
          className={twMerge(
            "grid grid-cols-1 gap-4 md:grid-cols-2",
            // Temporarily disable connecting to Windows Server accounts
            resource.resourceType === PamResourceType.Windows && "pointer-events-none opacity-60"
          )}
        >
          <ResourceCard name={resource.name} resourceId={resource.id} onAccess={onAccessResource} />
        </div>
      </div>
    </div>
  );
};
