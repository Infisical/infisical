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
};

export const AlgorithmSelectors = ({
  control,
  availableSignatureAlgorithms,
  availableKeyAlgorithms,
  signatureError,
  keyError
}: AlgorithmSelectorsProps) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Controller
          control={control}
          name="signatureAlgorithm"
          render={({ field: { onChange, ...field } }) => (
            <FormControl
              label="Signature Algorithm"
              errorText={signatureError}
              isError={Boolean(signatureError)}
            >
              <Select
                defaultValue=""
                {...field}
                onValueChange={(e) => onChange(e)}
                className="w-full"
                placeholder={
                  availableSignatureAlgorithms.length > 0
                    ? "Select signature algorithm"
                    : "No algorithms available"
                }
                position="popper"
              >
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
          name="keyAlgorithm"
          render={({ field: { onChange, ...field } }) => (
            <FormControl label="Key Algorithm" errorText={keyError} isError={Boolean(keyError)}>
              <Select
                defaultValue=""
                {...field}
                onValueChange={(e) => onChange(e)}
                className="w-full"
                placeholder={
                  availableKeyAlgorithms.length > 0
                    ? "Select key algorithm"
                    : "No algorithms available"
                }
                position="popper"
              >
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
