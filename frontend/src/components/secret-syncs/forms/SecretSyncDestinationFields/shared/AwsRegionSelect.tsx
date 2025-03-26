import { components, OptionProps, SingleValue } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, FilterableSelect } from "@app/components/v2";
import { AWS_REGIONS } from "@app/helpers/appConnections";

const Option = ({ isSelected, children, ...props }: OptionProps<(typeof AWS_REGIONS)[number]>) => {
  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        <p className="truncate">{children}</p>
        <Badge variant="success" className="ml-1 mr-auto cursor-pointer">
          {props.data.slug}
        </Badge>
        {isSelected && (
          <FontAwesomeIcon className="ml-2 text-primary" icon={faCheckCircle} size="sm" />
        )}
      </div>
    </components.Option>
  );
};

type Props = {
  value: string;
  onChange: (value: string | undefined) => void;
};

export const AwsRegionSelect = ({ value, onChange }: Props) => {
  return (
    <FilterableSelect
      value={AWS_REGIONS.find((region) => region.slug === value)}
      onChange={(option) => onChange((option as SingleValue<(typeof AWS_REGIONS)[number]>)?.slug)}
      options={AWS_REGIONS}
      placeholder="Select region..."
      getOptionLabel={(option) => option.name}
      getOptionValue={(option) => option.slug}
      components={{ Option }}
    />
  );
};
