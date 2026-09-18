type ComboboxInputAriaLabelProps = {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  id?: string;
  searchAriaLabel: string;
};

const getComboboxInputAriaLabel = ({
  ariaLabel,
  ariaLabelledBy,
  id,
  searchAriaLabel
}: ComboboxInputAriaLabelProps) => {
  if (ariaLabel) return ariaLabel;
  if (ariaLabelledBy || id) return undefined;
  return searchAriaLabel;
};

export { getComboboxInputAriaLabel };
