import { Spinner } from "@app/components/v2";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { SecretRotation, useSecretRotationV2Options } from "@app/hooks/api/secretRotationsV2";

type Props = {
  onSelect: (type: SecretRotation) => void;
};

export const SecretRotationV2Select = ({ onSelect }: Props) => {
  const { isPending, data: secretRotationOptions } = useSecretRotationV2Options();

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <Spinner size="lg" className="text-mineshaft-500" />
        <p className="mt-4 text-sm text-mineshaft-400">Loading options...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {secretRotationOptions?.map(({ type }) => {
        const { image, name, size } = SECRET_ROTATION_MAP[type];

        return (
          <button
            type="button"
            key={type}
            onClick={() => onSelect(type)}
            className="group relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 duration-200 hover:bg-mineshaft-600"
          >
            <img
              src={`/images/integrations/${image}`}
              width={size}
              className="mt-auto"
              alt={`${name} logo`}
            />
            <div className="mt-auto max-w-xs text-center text-xs font-medium text-gray-300 duration-200 group-hover:text-gray-200">
              {name}
            </div>
          </button>
        );
      })}
    </div>
  );
};
