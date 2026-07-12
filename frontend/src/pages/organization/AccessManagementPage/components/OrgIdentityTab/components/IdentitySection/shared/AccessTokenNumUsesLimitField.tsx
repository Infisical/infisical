import { Control, Controller } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

type Props = {
  control: Control<any>;
};

/**
 * Shared editor for an identity auth method's `accessTokenNumUsesLimit` field, which every
 * auth method exposes identically. Rendered separately from `AccessTokenTtlFields` because
 * Universal Auth hides the TTL fields when an access token period is set, but the use limit
 * always applies.
 */
export const AccessTokenNumUsesLimitField = ({ control }: Props) => (
  <Controller
    control={control}
    defaultValue="0"
    name="accessTokenNumUsesLimit"
    render={({ field, fieldState: { error } }) => (
      <Field>
        <FieldLabel htmlFor="accessTokenNumUsesLimit" className="inline-flex items-center gap-1.5">
          Access Token Max Number of Uses (optional)
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="size-3.5 text-muted" />
            </TooltipTrigger>
            <TooltipContent className="max-w-md">
              The maximum number of times that an access token can be used; leave blank for
              unlimited uses.
            </TooltipContent>
          </Tooltip>
        </FieldLabel>
        <Input
          {...field}
          id="accessTokenNumUsesLimit"
          placeholder="Unlimited uses"
          type="number"
          min="0"
          step="1"
          isError={Boolean(error)}
        />
        <FieldError>{error?.message}</FieldError>
      </Field>
    )}
  />
);
