import { ReactNode } from "react";
import { Control, Controller } from "react-hook-form";

import {
  Badge,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import {
  getCaSignatureIncompatibilityReason,
  isPqcAlgorithm
} from "@app/hooks/api/certificates/constants";

type AlgorithmOption = {
  value: string;
  label: string;
};

const NONE_VALUE = "__none__";

type AlgorithmOptionsProps = {
  options: AlgorithmOption[];
  nonePlaceholder?: string;
  caKeyAlgorithm?: string | null;
};

const AlgorithmOptions = ({ options, nonePlaceholder, caKeyAlgorithm }: AlgorithmOptionsProps) => {
  const { subscription } = useSubscription();

  return (
    <>
      {nonePlaceholder && <SelectItem value={NONE_VALUE}>{nonePlaceholder}</SelectItem>}
      {options.map((algorithm) => {
        const isGated = isPqcAlgorithm(algorithm.value) && !subscription?.pkiPqc;
        const incompatibilityReason = isGated
          ? undefined
          : getCaSignatureIncompatibilityReason(algorithm.value, caKeyAlgorithm);

        const item = (
          <SelectItem
            key={algorithm.value}
            value={algorithm.value}
            disabled={isGated || Boolean(incompatibilityReason)}
          >
            <span className="flex items-center gap-2">
              {algorithm.label}
              {isGated && <Badge variant="info">Enterprise</Badge>}
            </span>
          </SelectItem>
        );

        if (!incompatibilityReason) return item;

        return (
          <Tooltip key={algorithm.value}>
            <TooltipTrigger asChild>
              {/* The disabled item drops pointer events, so the wrapper carries the hover. */}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
              <span tabIndex={0} className="block">
                {item}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-64">
              {incompatibilityReason}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
};

type AlgorithmSelectProps = {
  control: Control<any>;
  name: string;
  label: string;
  options: AlgorithmOption[];
  error?: string;
  shouldUnregister?: boolean;
  isRequired: boolean;
  nonePlaceholder?: string;
  selectPlaceholder: string;
  children: ReactNode;
  disabledReason?: string;
};

const AlgorithmSelect = ({
  control,
  name,
  label,
  options,
  error,
  shouldUnregister,
  isRequired,
  nonePlaceholder,
  selectPlaceholder,
  children,
  disabledReason
}: AlgorithmSelectProps) => (
  <Controller
    control={control}
    name={name}
    shouldUnregister={shouldUnregister}
    render={({ field: { onChange, value } }) => (
      <Field>
        <FieldLabel>
          {label} {isRequired && <span className="text-danger">*</span>}
        </FieldLabel>
        <Select
          value={value ?? (nonePlaceholder ? NONE_VALUE : "")}
          onValueChange={(e) => onChange(e === NONE_VALUE ? null : e)}
          disabled={Boolean(disabledReason)}
        >
          <SelectTrigger className="w-full" isError={Boolean(error)}>
            {value ? (
              <SelectValue />
            ) : (
              <span className="text-muted">
                {options.length > 0 ? selectPlaceholder : "No algorithms available"}
              </span>
            )}
          </SelectTrigger>
          <SelectContent position="popper">{children}</SelectContent>
        </Select>
        {disabledReason && <FieldDescription>{disabledReason}</FieldDescription>}
        <FieldError>{error}</FieldError>
      </Field>
    )}
  />
);

type AlgorithmSelectorsProps = {
  control: Control<any>;
  availableSignatureAlgorithms: AlgorithmOption[];
  availableKeyAlgorithms: AlgorithmOption[];
  signatureError?: string;
  keyError?: string;
  shouldUnregister?: boolean;
  signatureFieldName?: string;
  keyFieldName?: string;
  isRequired?: boolean;
  nonePlaceholder?: string;
  hideSignatureAlgorithm?: boolean;
  keyAlgorithmDisabledReason?: string;
  keyAlgorithmRequired?: boolean;
  keyAlgorithmPlaceholder?: string;
  caKeyAlgorithm?: string | null;
};

export const AlgorithmSelectors = ({
  control,
  availableSignatureAlgorithms,
  availableKeyAlgorithms,
  signatureError,
  keyError,
  shouldUnregister,
  signatureFieldName = "signatureAlgorithm",
  keyFieldName = "keyAlgorithm",
  isRequired = true,
  nonePlaceholder,
  hideSignatureAlgorithm = false,
  keyAlgorithmDisabledReason,
  keyAlgorithmRequired = isRequired,
  keyAlgorithmPlaceholder = "Select key algorithm",
  caKeyAlgorithm
}: AlgorithmSelectorsProps) => (
  <div className={hideSignatureAlgorithm ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 gap-4"}>
    {!hideSignatureAlgorithm && (
      <AlgorithmSelect
        control={control}
        name={signatureFieldName}
        label="Signature Algorithm"
        options={availableSignatureAlgorithms}
        error={signatureError}
        shouldUnregister={shouldUnregister}
        isRequired={isRequired}
        nonePlaceholder={nonePlaceholder}
        selectPlaceholder="Select signature algorithm"
      >
        <AlgorithmOptions
          options={availableSignatureAlgorithms}
          nonePlaceholder={nonePlaceholder}
          caKeyAlgorithm={caKeyAlgorithm}
        />
      </AlgorithmSelect>
    )}

    <AlgorithmSelect
      control={control}
      name={keyFieldName}
      label="Key Algorithm"
      options={availableKeyAlgorithms}
      error={keyError}
      shouldUnregister={shouldUnregister}
      isRequired={keyAlgorithmRequired}
      nonePlaceholder={nonePlaceholder}
      selectPlaceholder={keyAlgorithmPlaceholder}
      disabledReason={keyAlgorithmDisabledReason}
    >
      <AlgorithmOptions options={availableKeyAlgorithms} nonePlaceholder={nonePlaceholder} />
    </AlgorithmSelect>
  </div>
);
