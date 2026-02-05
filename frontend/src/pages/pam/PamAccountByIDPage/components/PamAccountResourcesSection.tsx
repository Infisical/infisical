import { faArrowRight, faDesktop } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
      className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4 text-left transition-colors hover:border-mineshaft-500 hover:bg-mineshaft-700"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-mineshaft-700">
          <FontAwesomeIcon icon={faDesktop} className="text-mineshaft-300" />
        </div>
        <div>
          <p className="font-medium text-mineshaft-100">{name}</p>
          <p className="text-xs text-mineshaft-400">{resourceId.slice(0, 8)}</p>
        </div>
      </div>
      <FontAwesomeIcon icon={faArrowRight} className="text-mineshaft-400" />
    </button>
  );
};

export const PamAccountResourcesSection = ({ account, onAccessResource }: Props) => {
  const { resource } = account;

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900">
      <div className="border-b border-mineshaft-600 px-4 py-3">
        <h3 className="text-lg font-medium text-mineshaft-100">Resources</h3>
        <p className="text-sm text-bunker-300">Resources this account can access</p>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ResourceCard name={resource.name} resourceId={resource.id} onAccess={onAccessResource} />
        </div>
      </div>
    </div>
  );
};
