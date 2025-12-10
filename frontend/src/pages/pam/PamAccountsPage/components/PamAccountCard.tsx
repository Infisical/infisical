import { PAM_RESOURCE_TYPE_MAP, TPamAccount } from "@app/hooks/api/pam";
import { LogInIcon } from "lucide-react";

type Props = {
  account: TPamAccount;
  onAccess: (resource: TPamAccount) => void;
  accountPath?: string;
};

export const PamAccountCard = ({ account, onAccess, accountPath }: Props) => {
  const { name, description } = account;

  const { image, name: resourceTypeName } = PAM_RESOURCE_TYPE_MAP[account.resource.resourceType];

  return (
    <button
      onClick={() => onAccess(account)}
      type="button"
      key={account.id}
      className="border-mineshaft-600 bg-mineshaft-800 hover:bg-mineshaft-700 flex cursor-pointer flex-col overflow-clip rounded-sm border p-4 text-start transition-transform duration-100 hover:scale-[103%]"
    >
      <div className="flex items-center gap-4">
        <div className="border-mineshaft-500 bg-mineshaft-600 rounded-sm border p-1.5 shadow-inner">
          <img
            alt={resourceTypeName}
            src={`/images/integrations/${image}`}
            className="size-7 object-contain"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2">
            <p className="text-mineshaft-100 truncate text-lg font-medium">{name}</p>
            <LogInIcon className="text-mineshaft-400 size-5" />
          </div>

          <p
            className={`${accountPath ? "text-mineshaft-300" : "text-mineshaft-400"} truncate text-xs leading-4`}
          >
            {accountPath || "root"}
          </p>
        </div>
      </div>
      <p className="text-mineshaft-400 mt-4 truncate text-sm">{description || "No description"}</p>
    </button>
  );
};
