import { Control, Controller } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SECONDS_PER_DAY } from "@app/helpers/datetime";

type Props = {
  control: Control<any>;
  /** Server-enforced upper bound (seconds) used to render the "Max: N days" helper. */
  maxAccessTokenTTL: number;
};

/**
 * Shared editor for an identity auth method's `accessTokenTTL` and `accessTokenMaxTTL`
 * fields, which every auth method exposes identically. Pair this with
 * `superRefineAccessTokenTtl` in the form schema to enforce TTL <= Max TTL.
 */
export const AccessTokenTtlFields = ({ control, maxAccessTokenTTL }: Props) => {
  const maxDaysHelper = `Max: ${Math.floor(maxAccessTokenTTL / SECONDS_PER_DAY)} days`;

  return (
    <>
      <Controller
        control={control}
        name="accessTokenTTL"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="accessTokenTTL" className="inline-flex items-center gap-1.5">
              Access Token TTL (seconds)
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="size-3.5 text-muted" />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  The lifetime for an access token in seconds. This value will be referenced at
                  renewal time.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              {...field}
              id="accessTokenTTL"
              placeholder="2592000"
              type="number"
              min="1"
              step="1"
              isError={Boolean(error)}
            />
            <FieldDescription>{maxDaysHelper}</FieldDescription>
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="accessTokenMaxTTL"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="accessTokenMaxTTL" className="inline-flex items-center gap-1.5">
              Access Token Max TTL (seconds)
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="size-3.5 text-muted" />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  The maximum lifetime for an access token in seconds. This value will be referenced
                  at renewal time.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              {...field}
              id="accessTokenMaxTTL"
              placeholder="2592000"
              type="number"
              min="1"
              step="1"
              isError={Boolean(error)}
            />
            <FieldDescription>{maxDaysHelper}</FieldDescription>
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
    </>
  );
};
