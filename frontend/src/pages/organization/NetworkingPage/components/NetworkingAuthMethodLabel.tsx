import {
  components as ReactSelectComponents,
  type OptionProps,
  type SingleValueProps
} from "react-select";
import { CheckIcon, KeyIcon } from "lucide-react";

export type NetworkingAuthMethod = "aws" | "token";

export type NetworkingAuthMethodOption = {
  value: NetworkingAuthMethod;
  label: string;
};

export const NETWORKING_AUTH_METHOD_OPTIONS: NetworkingAuthMethodOption[] = [
  { value: "token", label: "Token Auth" },
  { value: "aws", label: "AWS Auth" }
];

const NetworkingAuthMethodIcon = ({ method }: { method: NetworkingAuthMethod }) =>
  method === "aws" ? (
    <img
      src="/images/integrations/Amazon Web Services.png"
      alt=""
      aria-hidden
      className="size-4 object-contain"
    />
  ) : (
    <KeyIcon className="size-4 text-accent" />
  );

export const NetworkingAuthMethodLabel = ({
  method,
  label
}: {
  method: NetworkingAuthMethod;
  label?: string;
}) => (
  <span className="flex min-w-0 items-center gap-2">
    <NetworkingAuthMethodIcon method={method} />
    <span className="truncate">
      {label ?? NETWORKING_AUTH_METHOD_OPTIONS.find(({ value }) => value === method)?.label}
    </span>
  </span>
);

export const NetworkingAuthMethodOption = (props: OptionProps<NetworkingAuthMethodOption>) => {
  const { data, isSelected } = props;

  return (
    <ReactSelectComponents.Option {...props}>
      <span className="flex items-center justify-between gap-2">
        <NetworkingAuthMethodLabel method={data.value} label={data.label} />
        {isSelected && <CheckIcon className="size-4 shrink-0" />}
      </span>
    </ReactSelectComponents.Option>
  );
};

export const NetworkingAuthMethodSingleValue = (
  props: SingleValueProps<NetworkingAuthMethodOption>
) => {
  const { data } = props;

  return (
    <ReactSelectComponents.SingleValue {...props}>
      <NetworkingAuthMethodLabel method={data.value} label={data.label} />
    </ReactSelectComponents.SingleValue>
  );
};
