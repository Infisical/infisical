import { DocumentationLinkBadge } from "@app/components/v3";
import { PAM_RESOURCE_TYPE_MAP, PamResourceType } from "@app/hooks/api/pam";

const PAM_RESOURCE_DOCS_MAP: Partial<Record<PamResourceType, string>> = {
  [PamResourceType.AwsIam]: "aws-iam#create-the-pam-resource",
  [PamResourceType.Kubernetes]: "kubernetes"
};

type Props = {
  resourceType: PamResourceType;
  onBack?: () => void;
};

export const PamResourceHeader = ({ resourceType, onBack }: Props) => {
  const details = PAM_RESOURCE_TYPE_MAP[resourceType];
  const docsPath = PAM_RESOURCE_DOCS_MAP[resourceType];

  return (
    <div className="mb-4 flex w-full items-start gap-2 border-b border-mineshaft-500 pb-4">
      <img
        alt={`${details.name} logo`}
        src={`/images/integrations/${details.image}`}
        className="h-12 w-12 rounded-md bg-bunker-500 p-2"
      />
      <div>
        <div className="flex items-center gap-x-2 text-mineshaft-300">
          {details.name}
          {docsPath && (
            <DocumentationLinkBadge
              href={`https://infisical.com/docs/documentation/platform/pam/resources/${docsPath}`}
            />
          )}
        </div>
        <p className="text-sm leading-4 text-mineshaft-400">Resource</p>
      </div>
      {onBack && (
        <button
          type="button"
          className="mt-1 ml-auto text-xs text-mineshaft-400 underline underline-offset-2 hover:text-mineshaft-300"
          onClick={onBack}
        >
          Select another resource type
        </button>
      )}
    </div>
  );
};
