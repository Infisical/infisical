import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { ArrowRightIcon, InfoIcon, KeyIcon, LockIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Badge,
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { HONEY_TOKEN_DEFAULT_SECRET_NAMES } from "@app/helpers/honeyTokens";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

import { THoneyTokenForm } from "../schemas";

export const AwsHoneyTokenMappingFields = () => {
  const fieldIdPrefix = useId();
  const {
    control,
    formState: { errors }
  } = useFormContext<THoneyTokenForm & { type: HoneyTokenType.AWS }>();

  const mappingError = errors.secretsMapping?.message;

  const defaults = HONEY_TOKEN_DEFAULT_SECRET_NAMES[HoneyTokenType.AWS];

  const items = [
    {
      id: "access-key-id",
      name: "Access Key ID",
      icon: <KeyIcon />,
      fieldName: "secretsMapping.accessKeyId" as const,
      placeholder: defaults.accessKeyId
    },
    {
      id: "secret-access-key",
      name: "Secret Access Key",
      icon: <LockIcon />,
      fieldName: "secretsMapping.secretAccessKey" as const,
      placeholder: defaults.secretAccessKey
    }
  ];

  return (
    <FieldSet className="@container">
      <FieldLegend className="sr-only">Honey token secret mappings</FieldLegend>
      <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 @lg:grid-cols-[minmax(10rem,auto)_1.25rem_minmax(0,1fr)] @lg:gap-y-1">
        <span className="hidden items-center text-xs font-medium text-accent @lg:flex">
          Decoy credential
        </span>
        <span className="hidden @lg:block" />
        <div className="hidden items-center gap-1 @lg:flex">
          <span className="text-xs font-medium text-accent">Secret name</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton variant="ghost-muted" size="xs" aria-label="About secret names">
                <InfoIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              The name of the secret that the decoy credential will be mapped to in your project.
            </TooltipContent>
          </Tooltip>
        </div>
        {items.map(({ id, name, icon, fieldName, placeholder }) => (
          <Controller
            key={fieldName}
            render={({ field, fieldState: { error } }) => {
              const inputId = `${fieldIdPrefix}-${id}`;
              const errorId = `${inputId}-error`;

              return (
                <>
                  <Badge variant="neutral" isFullWidth className="h-9 text-xs">
                    {icon}
                    {name}
                  </Badge>
                  <div className="flex h-5 items-center justify-center @lg:h-9">
                    <ArrowRightIcon className="size-5 rotate-90 text-accent @lg:rotate-0" />
                  </div>
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={inputId} className="@lg:sr-only">
                      Secret name for {name}
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        {...field}
                        id={inputId}
                        placeholder={placeholder}
                        isError={Boolean(error)}
                        aria-describedby={error ? errorId : undefined}
                      />
                      <InputGroupAddon align="inline-end">
                        <Badge variant="warning">Decoy</Badge>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldError id={errorId}>{error?.message}</FieldError>
                  </Field>
                </>
              );
            }}
            control={control}
            name={fieldName}
          />
        ))}
      </div>
      <FieldError>{mappingError}</FieldError>
      <Alert variant="info">
        <InfoIcon />
        <AlertDescription>
          These keys will appear as normal secrets in your project but are tied to a sandboxed IAM
          user with zero permissions. Any API call made with these credentials triggers an alert.
        </AlertDescription>
      </Alert>
    </FieldSet>
  );
};
