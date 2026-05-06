import { Controller, useFormContext } from "react-hook-form";
import { ArrowRightIcon, InfoIcon, KeyIcon, LockIcon } from "lucide-react";

import {
  Badge,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { HONEY_TOKEN_DEFAULT_SECRET_NAMES } from "@app/helpers/honeyTokens";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

import { THoneyTokenForm } from "../schemas";

export const AwsHoneyTokenMappingFields = () => {
  const {
    control,
    formState: { errors }
  } = useFormContext<THoneyTokenForm & { type: HoneyTokenType.AWS }>();

  const mappingError = errors.secretsMapping?.message;

  const defaults = HONEY_TOKEN_DEFAULT_SECRET_NAMES[HoneyTokenType.AWS];

  const items = [
    {
      name: "Access Key ID",
      icon: <KeyIcon />,
      fieldName: "secretsMapping.accessKeyId" as const,
      placeholder: defaults.accessKeyId
    },
    {
      name: "Secret Access Key",
      icon: <LockIcon />,
      fieldName: "secretsMapping.secretAccessKey" as const,
      placeholder: defaults.secretAccessKey
    }
  ];

  return (
    <div className="w-full overflow-hidden">
      <table className="w-full table-auto">
        <thead>
          <tr className="text-left">
            <th className="pb-3 whitespace-nowrap">
              <FieldLabel>Decoy Credential</FieldLabel>
            </th>
            <th className="pb-3" />
            <th className="pb-3">
              <FieldLabel>
                Secret Name
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="size-3.5 text-muted" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The name of the secret that the decoy credential will be mapped to in your
                    project.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ name, icon, fieldName, placeholder }) => (
            <tr key={name}>
              <td className="pb-4 align-top whitespace-nowrap">
                <Badge variant="neutral" className="h-9 w-full justify-center text-xs">
                  {icon}
                  {name}
                </Badge>
              </td>
              <td className="px-5 pb-4 align-top">
                <div className="flex h-9 items-center">
                  <ArrowRightIcon className="size-5 text-accent" />
                </div>
              </td>
              <td className="w-full pb-4 align-top">
                <Controller
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <div>
                      <div className="relative">
                        <Input
                          value={value}
                          onChange={onChange}
                          placeholder={placeholder}
                          isError={Boolean(error)}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
                          <Badge variant="warning" className="text-[10px]">
                            Decoy
                          </Badge>
                        </span>
                      </div>
                      {error && <FieldError>{error.message}</FieldError>}
                    </div>
                  )}
                  control={control}
                  name={fieldName}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {mappingError && (
        <div className="mt-2 rounded-sm border border-red/40 bg-red/10 p-3 text-xs text-mineshaft-200">
          {mappingError}
        </div>
      )}
      <div className="mt-2 flex items-start gap-2 rounded-sm border border-info/40 bg-info/10 p-3 text-xs text-mineshaft-200">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-info" />
        These keys will appear as normal secrets in your project but are tied to a sandboxed IAM
        user with zero permissions. Any API call made with these credentials triggers an alert.
      </div>
    </div>
  );
};
