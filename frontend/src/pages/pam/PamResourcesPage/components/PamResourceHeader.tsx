import { PAM_RESOURCE_TYPE_MAP, PamResourceType } from "@app/hooks/api/pam";

type Props = {
  resourceType: PamResourceType;
  onBack?: () => void;
};

export const PamResourceHeader = ({ resourceType, onBack }: Props) => {
  const details = PAM_RESOURCE_TYPE_MAP[resourceType];

  return (
    <div className="mb-4 flex w-full items-start gap-2 border-b border-mineshaft-500 pb-4">
      <img
        alt={`${details.name} logo`}
        src={`/images/integrations/${details.image}`}
        className="h-12 w-12 rounded-md bg-bunker-500 p-2"
      />
      <div>
        <div className="flex items-center text-mineshaft-300">{details.name}</div>
        <p className="text-sm leading-4 text-mineshaft-400">External resource</p>
      </div>
      {onBack && (
        <button
          type="button"
          className="ml-auto mt-1 text-xs text-mineshaft-400 underline underline-offset-2 hover:text-mineshaft-300"
          onClick={onBack}
        >
          Select another resource type
        </button>
      )}
    </div>
  );
};
