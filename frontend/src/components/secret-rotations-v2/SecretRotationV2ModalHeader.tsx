import { DocumentationLinkBadge } from "@app/components/v3";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

type Props = {
  type: SecretRotation;
  isConfigured: boolean;
};

export const SecretRotationV2ModalHeader = ({ type, isConfigured }: Props) => {
  const destinationDetails = SECRET_ROTATION_MAP[type];

  return (
    <div className="flex w-full items-start gap-3">
      <img
        alt={`${destinationDetails.name} logo`}
        src={`/images/integrations/${destinationDetails.image}`}
        className="size-10 rounded-md border border-border bg-card object-contain p-1.5"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-alliance text-lg font-medium text-foreground">
          <span>{destinationDetails.name} Rotation</span>
          <DocumentationLinkBadge
            href={`https://infisical.com/docs/documentation/platform/secret-rotation/${type}`}
          />
        </div>
        <p className="mt-1 text-sm text-accent">
          {isConfigured
            ? `Edit ${destinationDetails.name} Rotation`
            : `Rotate ${destinationDetails.name}`}
        </p>
      </div>
    </div>
  );
};
