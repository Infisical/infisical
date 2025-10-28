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
    <div className="flex w-full items-start gap-2">
      <img
        alt={`${destinationDetails.name} logo`}
        src={`/images/integrations/${destinationDetails.image}`}
        className="h-12 w-12 rounded-md bg-bunker-500 p-2"
      />
      <div>
        <div className="flex items-center gap-x-2 text-mineshaft-300">
          {destinationDetails.name} Rotation
          <DocumentationLinkBadge
            href={`https://infisical.com/docs/documentation/platform/secret-rotation/${type}`}
          />
        </div>
        <p className="text-sm leading-4 text-mineshaft-400">
          {isConfigured
            ? `Edit ${destinationDetails.name} Rotation`
            : `Rotate ${destinationDetails.name}`}
        </p>
      </div>
    </div>
  );
};
