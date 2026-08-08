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
    <div className="flex w-full items-start gap-3 pr-8">
      <img
        alt={`${destinationDetails.name} logo`}
        src={`/images/integrations/${destinationDetails.image}`}
        className="size-10 rounded-md border border-border bg-card object-contain p-2"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
          <span>{destinationDetails.name} secret rotation</span>
          <DocumentationLinkBadge
            href={`https://infisical.com/docs/documentation/platform/secret-rotation/${type}`}
          />
        </div>
        <p className="mt-1 text-sm leading-4 font-normal text-muted">
          {isConfigured
            ? `Edit the ${destinationDetails.name} rotation configuration.`
            : `Configure how Infisical rotates ${destinationDetails.name.toLowerCase()}.`}
        </p>
      </div>
    </div>
  );
};
