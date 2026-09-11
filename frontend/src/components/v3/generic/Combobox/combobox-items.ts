export const mergeComboboxItems = <TOption>(
  options: readonly TOption[],
  selectedOptions: readonly TOption[],
  getOptionValue: (option: TOption) => string,
  includeMissingSelectedOptions: boolean
): TOption[] => {
  const selectedByValue = new Map(
    selectedOptions.map((option) => [getOptionValue(option), option])
  );
  const optionValues = new Set(options.map(getOptionValue));
  const items = options.map((option) => selectedByValue.get(getOptionValue(option)) ?? option);

  if (includeMissingSelectedOptions) {
    selectedOptions.forEach((option) => {
      const value = getOptionValue(option);
      if (!optionValues.has(value)) {
        items.push(option);
        optionValues.add(value);
      }
    });
  }
  return items;
};
