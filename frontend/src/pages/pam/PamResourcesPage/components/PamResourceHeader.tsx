import { PencilIcon } from "lucide-react";

import { Button, DocumentationLinkBadge, Label } from "@app/components/v3";
import { PAM_RESOURCE_TYPE_MAP, PamResourceType } from "@app/hooks/api/pam";

const PAM_RESOURCE_DOCS_MAP: Partial<Record<PamResourceType, string>> = {
  [PamResourceType.AwsIam]: "aws-iam#create-the-pam-resource",
  [PamResourceType.Kubernetes]: "kubernetes#create-the-pam-resource",
  [PamResourceType.MySQL]: "mysql#create-the-pam-resource",
  [PamResourceType.Postgres]: "postgresql#create-the-pam-resource",
  [PamResourceType.Redis]: "redis#create-the-pam-resource",
  [PamResourceType.SSH]: "ssh#create-the-pam-resource",
  [PamResourceType.Windows]: "windows-server#create-the-pam-resource"
};

type Props = {
  resourceType: PamResourceType;
  onBack?: () => void;
};

export const PamResourceHeader = ({ resourceType, onBack }: Props) => {
  const details = PAM_RESOURCE_TYPE_MAP[resourceType];
  const docsPath = PAM_RESOURCE_DOCS_MAP[resourceType];

  return (
    <div className="flex w-full items-center gap-2.5 border-b border-border p-3">
      <img
        alt={`${details.name} logo`}
        src={`/images/integrations/${details.image}`}
        className="size-9"
      />
      <div className="flex w-full flex-col gap-1">
        <Label>
          {details.name}
          {docsPath && (
            <DocumentationLinkBadge
              href={`https://infisical.com/docs/documentation/platform/pam/getting-started/resources/${docsPath}`}
            />
          )}
        </Label>
        <p className="text-xs text-muted">Resoure</p>
      </div>
      {onBack && (
        <Button size="xs" variant="neutral" onClick={onBack}>
          <PencilIcon />
          Change
        </Button>
      )}
    </div>
  );
};
