import { ReactNode } from "react";
import { Control, Controller, useFieldArray } from "react-hook-form";
import { InfoIcon, PlusIcon, XIcon } from "lucide-react";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

type Props = {
  control: Control<any>;
  /** The field-array name on the form (e.g. "accessTokenTrustedIps"). */
  name: string;
  /** Label rendered above the first row. */
  label: string;
  /** Whether the IP allowlisting feature is available on the current plan. */
  isAllowed: boolean;
  /** Invoked when a gated action is attempted without the feature (opens the upgrade prompt). */
  onUpgradeRequired: () => void;
  /** Optional info tooltip shown next to the label. */
  tooltip?: ReactNode;
};

/**
 * Shared editor for an identity auth method's trusted-IP constraints. Every auth
 * method supports `accessTokenTrustedIps`; Universal Auth additionally renders
 * `clientSecretTrustedIps` by using a second instance of this component.
 */
export const TrustedIpsField = ({
  control,
  name,
  label,
  isAllowed,
  onUpgradeRequired,
  tooltip
}: Props) => {
  const { fields, append, remove } = useFieldArray({ control, name });

  // At least one trusted IP is required, so the last remaining row can't be removed.
  const isLast = fields.length <= 1;

  // IP allowlisting is a paid feature, so every mutation is gated behind the upgrade prompt.
  const guard = (action: () => void) => {
    if (isAllowed) {
      action();
      return;
    }
    onUpgradeRequired();
  };

  return (
    <div className="flex flex-col gap-3">
      {fields.map(({ id }, index) => (
        <div className="flex items-start gap-2" key={id}>
          <Controller
            control={control}
            name={`${name}.${index}.ipAddress`}
            defaultValue="0.0.0.0/0"
            render={({ field, fieldState: { error } }) => (
              <Field className="flex-1">
                {index === 0 && (
                  <FieldLabel
                    htmlFor={`${name}-${index}`}
                    className={tooltip ? "inline-flex items-center gap-1.5" : undefined}
                  >
                    {label}
                    {tooltip && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="size-3.5 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">{tooltip}</TooltipContent>
                      </Tooltip>
                    )}
                  </FieldLabel>
                )}
                <Input
                  id={`${name}-${index}`}
                  value={field.value}
                  onChange={(e) => guard(() => field.onChange(e))}
                  placeholder="123.456.789.0"
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Wrapper span keeps the tooltip hoverable while the button is disabled. */}
              <span className={index === 0 ? "mt-[1.625rem]" : "mt-0.5"}>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove trusted IP"
                  isDisabled={isLast}
                  onClick={() => guard(() => remove(index))}
                >
                  <XIcon />
                </IconButton>
              </span>
            </TooltipTrigger>
            {isLast && (
              <TooltipContent className="max-w-md">At least one IP is required</TooltipContent>
            )}
          </Tooltip>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="w-fit"
        onClick={() => guard(() => append({ ipAddress: "0.0.0.0/0" }))}
      >
        <PlusIcon />
        Add IP Address
      </Button>
    </div>
  );
};
