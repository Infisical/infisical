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
  id: string;
  value: string;
  onChange: (value: string | undefined) => void;
  regions?: typeof AWS_REGIONS;
  isError?: boolean;
  isDisabled?: boolean;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
};

export const AwsRegionSelect = ({
  id,
  value,
  onChange,
  regions = AWS_REGIONS,
  isError,
  ...props
}: Props) => {
  return (
    <Combobox
      id={id}
      value={regions.find((region) => region.slug === value)}
      onValueChange={(option) => onChange(option?.slug ?? "")}
      options={regions}
      isError={isError}
      placeholder="Select region..."
      getOptionLabel={(option) => option.name}
      getOptionValue={(option) => option.slug}
      getOptionKeywords={(option) => [option.slug]}
      renderOption={renderRegion}
      renderValue={renderRegion}
      modal
      {...props}
    />
  );
};
