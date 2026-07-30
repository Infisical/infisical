import { ReactNode } from "react";
import { Control, Controller } from "react-hook-form";

import {
  Badge,
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import { isPqcAlgorithm } from "@app/hooks/api/certificates/constants";

type AlgorithmOption = {
  value: string;
  label: string;
};

const NONE_VALUE = "__none__";

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
  renderOptions: (options: AlgorithmOption[]) => ReactNode;
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
  renderOptions
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
        >
          <SelectTrigger className="w-full" isError={Boolean(error)}>
            <SelectValue
              placeholder={options.length > 0 ? selectPlaceholder : "No algorithms available"}
            />
          </SelectTrigger>
          <SelectContent position="popper">{renderOptions(options)}</SelectContent>
        </Select>
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
  hideSignatureAlgorithm = false
}: AlgorithmSelectorsProps) => {
  const { subscription } = useSubscription();

  const renderOptions = (options: AlgorithmOption[]): ReactNode => (
    <>
      {nonePlaceholder && <SelectItem value={NONE_VALUE}>{nonePlaceholder}</SelectItem>}
      {options.map((algorithm) => {
        const isGated = isPqcAlgorithm(algorithm.value) && !subscription?.pkiPqc;
        return (
          <SelectItem key={algorithm.value} value={algorithm.value} disabled={isGated}>
            <span className="flex items-center gap-2">
              {algorithm.label}
              {isGated && <Badge variant="info">Enterprise</Badge>}
            </span>
          </SelectItem>
        );
      })}
    </>
  );

  return (
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
          renderOptions={renderOptions}
        />
      )}

      <AlgorithmSelect
        control={control}
        name={keyFieldName}
        label="Key Algorithm"
        options={availableKeyAlgorithms}
        error={keyError}
        shouldUnregister={shouldUnregister}
        isRequired={isRequired}
        nonePlaceholder={nonePlaceholder}
        selectPlaceholder="Select key algorithm"
        renderOptions={renderOptions}
      />
    </div>
  );
};
