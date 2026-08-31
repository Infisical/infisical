import { Badge, Combobox } from "@app/components/v3";
import { AWS_REGIONS } from "@app/helpers/appConnections";

const renderRegion = (option: (typeof AWS_REGIONS)[number]) => (
  <div className="flex min-w-0 items-center gap-1">
    <span className="truncate">{option.name}</span>
    <Badge variant="neutral" className="shrink-0">
      {option.slug}
    </Badge>
  </div>
);

type Props = {
  value: string;
  onChange: (value: string | undefined) => void;
};

export const AwsRegionSelect = ({ value, onChange }: Props) => {
  return (
    <Combobox
      value={AWS_REGIONS.find((region) => region.slug === value)}
      onValueChange={(option) => onChange(option.slug)}
      options={AWS_REGIONS}
      placeholder="Select region..."
      getOptionLabel={(option) => option.name}
      getOptionValue={(option) => option.slug}
      renderOption={renderRegion}
      renderValue={renderRegion}
      modal
    />
  );
};
