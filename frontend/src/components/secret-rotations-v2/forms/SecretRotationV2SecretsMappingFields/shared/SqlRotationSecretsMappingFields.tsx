import { Controller, useFormContext } from "react-hook-form";
import { faArrowRight, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { Badge, FormControl, FormLabel, Input } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const SqlRotationSecretsMappingFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.PostgresCredentials; // all sql rotations share these fields
    }
  >();

  const items = [
    {
      name: "Username",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input value={value} onChange={onChange} placeholder="DB_USERNAME" />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.username"
        />
      )
    },
    {
      name: "Password",
      input: (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input value={value} onChange={onChange} placeholder="DB_PASSWORD" />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.password"
        />
      )
    }
  ];

  return (
    <div className="w-full overflow-hidden">
      <table className="w-full table-auto">
        <thead>
          <tr className="text-left">
            <th className="whitespace-nowrap">
              <FormLabel label="Rotated Credentials" />
            </th>
            <th />
            <th>
              <FormLabel
                tooltipClassName="max-w-sm"
                tooltipText="The name of the secret that the active credentials will be mapped to."
                label="Secret Name"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ name, input }) => (
            <tr key={name}>
              <td className="whitespace-nowrap">
                <div className="mb-4 flex h-full items-start justify-center">
                  <Badge className="pointer-events-none flex h-[36px] w-full items-center justify-center gap-1.5 whitespace-nowrap border border-mineshaft-600 bg-mineshaft-600 text-bunker-200">
                    <FontAwesomeIcon icon={faKey} />
                    <span>{name}</span>
                  </Badge>
                </div>
              </td>
              <td className="whitespace-nowrap pl-5 pr-5">
                <div className="mb-4 flex items-center justify-center">
                  <FontAwesomeIcon className="text-mineshaft-400" icon={faArrowRight} />
                </div>
              </td>
              <td className="w-full">{input}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
