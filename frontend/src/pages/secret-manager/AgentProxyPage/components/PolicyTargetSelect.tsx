import {
  components as ReactSelectComponents,
  GroupBase,
  type OptionProps,
  type Props as SelectProps,
  type SingleValueProps
} from "react-select";
import { CheckIcon } from "lucide-react";

import { FilterableSelect } from "@app/components/v3";

import { PolicyTargetIcon } from "./PolicyTargetCell";

export type TPolicyTargetOption = { key: string; label: string };

const PolicyTargetLabel = ({ option }: { option: TPolicyTargetOption }) => (
  <span className="flex min-w-0 items-center gap-2">
    <PolicyTargetIcon target={option.key} />
    <span className="truncate">{option.label}</span>
  </span>
);

const PolicyTargetOption = (props: OptionProps<TPolicyTargetOption>) => {
  const { data, isSelected } = props;

  return (
    <ReactSelectComponents.Option {...props}>
      <span className="flex items-center justify-between gap-2">
        <PolicyTargetLabel option={data} />
        {isSelected && <CheckIcon className="size-4 shrink-0" />}
      </span>
    </ReactSelectComponents.Option>
  );
};

const PolicyTargetSingleValue = (props: SingleValueProps<TPolicyTargetOption>) => {
  const { data } = props;

  return (
    <ReactSelectComponents.SingleValue {...props}>
      <PolicyTargetLabel option={data} />
    </ReactSelectComponents.SingleValue>
  );
};

type Props = {
  options: TPolicyTargetOption[];
  value?: TPolicyTargetOption;
  onChange: SelectProps<TPolicyTargetOption, boolean, GroupBase<TPolicyTargetOption>>["onChange"];
  isDisabled?: boolean;
  isError?: boolean;
};

export const PolicyTargetSelect = ({ options, value, onChange, isDisabled, isError }: Props) => (
  <FilterableSelect
    placeholder="Select target..."
    options={options}
    value={value}
    onChange={onChange}
    getOptionValue={(option) => option.key}
    getOptionLabel={(option) => option.label}
    components={{ Option: PolicyTargetOption, SingleValue: PolicyTargetSingleValue }}
    isDisabled={isDisabled}
    isError={isError}
  />
);
