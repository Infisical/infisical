export type ComboboxCreationContext<TOption> = {
  options: readonly TOption[];
  selectedOptions: readonly TOption[];
};

type GetComboboxCreationInputProps<TOption> = ComboboxCreationContext<TOption> & {
  inputValue: string;
  getOptionLabel: (option: TOption) => string;
  isDuplicate?: (inputValue: string, option: TOption) => boolean;
  isValid?: (inputValue: string, context: ComboboxCreationContext<TOption>) => boolean;
};

export const getComboboxCreationInput = <TOption>({
  inputValue,
  options,
  selectedOptions,
  getOptionLabel,
  isDuplicate,
  isValid
}: GetComboboxCreationInputProps<TOption>) => {
  const trimmedInput = inputValue.trim();
  if (!trimmedInput) return null;

  const context = { options, selectedOptions };
  if (isValid && !isValid(trimmedInput, context)) return null;

  const duplicate = [...options, ...selectedOptions].some((option) =>
    isDuplicate ? isDuplicate(trimmedInput, option) : getOptionLabel(option).trim() === trimmedInput
  );

  return duplicate ? null : trimmedInput;
};
