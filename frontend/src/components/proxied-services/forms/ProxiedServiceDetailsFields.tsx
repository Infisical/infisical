import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Input,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

import { TProxiedServiceForm } from "./schema";

type Props = {
  isDuplicateName?: boolean;
};

export const ProxiedServiceDetailsFields = ({ isDuplicateName }: Props) => {
  const {
    control,
    register,
    formState: { errors }
  } = useFormContext<TProxiedServiceForm>();

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel>Service Name</FieldLabel>
        <FieldContent>
          <Input
            placeholder="stripe-api"
            isError={Boolean(errors.name) || isDuplicateName}
            {...register("name")}
          />
          <FieldDescription>Lowercase letters, numbers, and hyphens only.</FieldDescription>
          <FieldError errors={[errors.name]} />
          {isDuplicateName && !errors.name && (
            <FieldError>A proxied service with this name already exists in this folder.</FieldError>
          )}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>
          Host Pattern
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>
                The hosts whose traffic this service brokers. Separate multiple with commas, for
                example:
              </p>
              <p className="mt-1.5 font-mono">
                api.stripe.com, *.github.com/v1/*, internal.corp.com:8443
              </p>
            </TooltipContent>
          </Tooltip>
        </FieldLabel>
        <FieldContent>
          <Input
            placeholder="api.stripe.com, *.github.com/v1/*"
            isError={Boolean(errors.hostPattern)}
            {...register("hostPattern")}
          />
          <FieldError errors={[errors.hostPattern]} />
        </FieldContent>
      </Field>

      <Controller
        control={control}
        name="isEnabled"
        render={({ field }) => (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Enabled</FieldTitle>
              <FieldDescription>
                When off, the proxy stops brokering this service&apos;s traffic.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="proxied-service-enabled"
              variant="project"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </Field>
        )}
      />
    </div>
  );
};
