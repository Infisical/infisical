import { Control, Controller } from "react-hook-form";

import { FormControl, Select, SelectItem } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useSubscription } from "@app/context";
import { isPqcAlgorithm } from "@app/hooks/api/certificates/constants";

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
  hideSignatureAlgorithm?: boolean;
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
  nonePlaceholder,
  hideSignatureAlgorithm = false
}: AlgorithmSelectorsProps) => {
  const { subscription } = useSubscription();
  return (
    <div className={hideSignatureAlgorithm ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 gap-4"}>
      {!hideSignatureAlgorithm && (
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
                    <SelectItem
                      key={algorithm.value}
                      value={algorithm.value}
                      isDisabled={isPqcAlgorithm(algorithm.value) && !subscription?.pkiPqc}
                    >
                      <div className="flex items-center gap-2">
                        {algorithm.label}
                        {isPqcAlgorithm(algorithm.value) && !subscription?.pkiPqc && (
                          <Badge variant="info">Enterprise</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
        </div>
      )}

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
                  <SelectItem
                    key={algorithm.value}
                    value={algorithm.value}
                    isDisabled={isPqcAlgorithm(algorithm.value) && !subscription?.pkiPqc}
                  >
                    <div className="flex items-center gap-2">
                      {algorithm.label}
                      {isPqcAlgorithm(algorithm.value) && !subscription?.pkiPqc && (
                        <Badge variant="info">Enterprise</Badge>
                      )}
                    </div>
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
