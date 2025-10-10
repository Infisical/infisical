import { PAM_RESOURCE_TYPE_MAP, PamResourceType } from "@app/hooks/api/pam";

type Props = {
  resourceType: PamResourceType;
  onBack?: () => void;
};

export const PamResourceHeader = ({ resourceType, onBack }: Props) => {
  const details = PAM_RESOURCE_TYPE_MAP[resourceType];

  return (
    <div className="border-mineshaft-500 mb-4 flex w-full items-start gap-2 border-b pb-4">
      <img
        alt={`${details.name} logo`}
        src={`/images/integrations/${details.image}`}
        className="bg-bunker-500 h-12 w-12 rounded-md p-2"
      />
      <div>
        <div className="text-mineshaft-300 flex items-center">{details.name}</div>
        <p className="text-mineshaft-400 text-sm leading-4">Resource</p>
      </div>
      {onBack && (
        <button
          type="button"
          className="text-mineshaft-400 hover:text-mineshaft-300 ml-auto mt-1 text-xs underline underline-offset-2"
          onClick={onBack}
        >
          Select another resource type
        </button>
      )}
    </div>
  );
};
