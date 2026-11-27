import { Combobox, type ComboboxProps } from "@infisical/cipher/ui/combobox";

import { AWS_REGIONS } from "@app/helpers/appConnections";

type SingleComboboxProps = Omit<
  Extract<ComboboxProps, { multiple?: false }>,
  "options" | "multiple"
>;

export const awsRegionOptions = AWS_REGIONS.map((region) => ({
  value: region.slug,
  label: region.name,
  meta: region.slug
}));

export const RegionCombobox = ({
  label = "Region",
  placeholder = "Select a region",
  ...props
}: Omit<SingleComboboxProps, "label"> & {
  label?: string;
}) => <Combobox {...props} label={label} placeholder={placeholder} options={awsRegionOptions} />;
