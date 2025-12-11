import { Badge, UnstableButton } from "@app/components/v3";
import { PAM_RESOURCE_TYPE_MAP, TPamAccount } from "@app/hooks/api/pam";
import { LogInIcon, PackageOpenIcon } from "lucide-react";

type Props = {
  account: TPamAccount;
  onAccess: (resource: TPamAccount) => void;
  accountPath?: string;
};

export const PamAccountCard = ({ account, onAccess, accountPath }: Props) => {
  const { name, description, resource } = account;

  const { image, name: resourceTypeName } = PAM_RESOURCE_TYPE_MAP[account.resource.resourceType];

  return (
    <button
      type="button"
      key={account.id}
      className="flex flex-col overflow-clip rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-4 text-start transition-transform duration-100"
    >
      <div className="flex items-center gap-3.5">
        <img
          alt={resourceTypeName}
          src={`/images/integrations/${image}`}
          className="size-10 object-contain"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-lg font-medium text-mineshaft-100">{name}</p>
            <UnstableButton onClick={() => onAccess(account)} size="xs" variant="outline">
              <LogInIcon />
              Connect
            </UnstableButton>
          </div>

          <p
            className={`${accountPath ? "text-mineshaft-300" : "text-mineshaft-400"} truncate text-xs leading-4`}
          >
            {resourceTypeName} - {accountPath || "root"}
          </p>
        </div>
      </div>
      <Badge variant="neutral" className="mt-3.5">
        <PackageOpenIcon />
        {resource.name}
      </Badge>
      <p className="mt-2 truncate text-sm text-mineshaft-400">{description || "No description"}</p>
    </button>
  );
};
