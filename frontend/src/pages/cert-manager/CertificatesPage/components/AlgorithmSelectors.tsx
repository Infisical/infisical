import { Control, Controller } from "react-hook-form";

import { FormControl, Select, SelectItem } from "@app/components/v2";

type AlgorithmOption = {
  value: string;
  label: string;
};

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
};

const NONE_VALUE = "__none__";

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
  nonePlaceholder
}: AlgorithmSelectorsProps) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Controller
          control={control}
          name={signatureFieldName}
          shouldUnregister={shouldUnregister}
          render={({ field: { onChange, value, ...field } }) => (
            <FormControl
              label="Signature Algorithm"
              errorText={signatureError}
              isError={Boolean(signatureError)}
              isRequired={isRequired}
            >
              <Select
                defaultValue=""
                {...field}
                value={value ?? (nonePlaceholder ? NONE_VALUE : "")}
                onValueChange={(e) => onChange(e === NONE_VALUE ? null : e)}
                className="w-full"
                placeholder={
                  availableSignatureAlgorithms.length > 0
                    ? "Select signature algorithm"
                    : "No algorithms available"
                }
                position="popper"
              >
                {nonePlaceholder && <SelectItem value={NONE_VALUE}>{nonePlaceholder}</SelectItem>}
                {availableSignatureAlgorithms.map((algorithm) => (
                  <SelectItem key={algorithm.value} value={algorithm.value}>
                    {algorithm.label}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
      </div>

      <div>
        <Controller
          control={control}
          name={keyFieldName}
          shouldUnregister={shouldUnregister}
          render={({ field: { onChange, value, ...field } }) => (
            <FormControl
              label="Key Algorithm"
              errorText={keyError}
              isError={Boolean(keyError)}
              isRequired={isRequired}
            >
              <Select
                defaultValue=""
                {...field}
                value={value ?? (nonePlaceholder ? NONE_VALUE : "")}
                onValueChange={(e) => onChange(e === NONE_VALUE ? null : e)}
                className="w-full"
                placeholder={
                  availableKeyAlgorithms.length > 0
                    ? "Select key algorithm"
                    : "No algorithms available"
                }
                position="popper"
              >
                {nonePlaceholder && <SelectItem value={NONE_VALUE}>{nonePlaceholder}</SelectItem>}
                {availableKeyAlgorithms.map((algorithm) => (
                  <SelectItem key={algorithm.value} value={algorithm.value}>
                    {algorithm.label}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
      </div>
    </div>
  );
};
