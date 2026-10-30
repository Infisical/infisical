import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Combobox } from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import {
  approvalPolicyQuery,
  ApprovalPolicyScope,
  ApprovalPolicyType,
  AutoApprovalConstraintValue,
  TAutoApprovalCatalogConstraint,
  TAutoApprovalOption
} from "@app/hooks/api/approvalPolicies";

type Props = {
  policyType: ApprovalPolicyType;
  scope: ApprovalPolicyScope;
  scopeId: string;
  connectionId: string;
  subject: string;
  constraint: TAutoApprovalCatalogConstraint;
  values: string[];
  // Values picked in the rule's other conditions, which narrow these options
  siblings: Record<string, string[]>;
  onChange: (values: string[]) => void;
  isError?: boolean;
};

const toOption = (value: string): TAutoApprovalOption => ({ value, label: value });

export const AutoApprovalValuePicker = ({
  policyType,
  scope,
  scopeId,
  connectionId,
  subject,
  constraint,
  values,
  siblings,
  onChange,
  isError
}: Props) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);

  const {
    data: options = [],
    isFetching,
    isError: isOptionsError
  } = useQuery({
    ...approvalPolicyQuery.autoApprovalOptions({
      policyType,
      scope,
      scopeId,
      connectionId,
      subject,
      constraint: constraint.id,
      search: debouncedSearch.trim(),
      siblings
    }),
    enabled: constraint.hasOptions,
    staleTime: 30_000,
    retry: false
  });

  const selected = useMemo(
    () =>
      values.map((value) => options.find((option) => option.value === value) ?? toOption(value)),
    [values, options]
  );

  // Values are free text too: a label can be new, and the service may be unreachable while editing
  const creation = {
    onCreate: (input: string) => {
      const value = input.trim();
      if (!value || values.includes(value)) return;
      onChange(
        constraint.value === AutoApprovalConstraintValue.Many ? [...values, value] : [value]
      );
    },
    formatLabel: (input: string) => `Use "${input.trim()}"`,
    emptyLabel: "Type custom value"
  };

  const emptyMessage = isOptionsError
    ? "Couldn't load values. Type one instead."
    : "No matches. Type a value to use it.";

  if (constraint.value === AutoApprovalConstraintValue.Many) {
    return (
      <Combobox
        multiple
        singleLine
        isClearable={false}
        aria-label={constraint.label}
        options={options}
        value={selected}
        onValueChange={(next) => onChange(next.map((option) => option.value))}
        getOptionValue={(option) => option.value}
        getOptionLabel={(option) => option.label}
        shouldFilter={false}
        includeMissingSelectedOptions
        onInputValueChange={setSearch}
        isLoading={isFetching}
        isError={isError}
        size="sm"
        emptyMessage={emptyMessage}
        placeholder="Choose values..."
        creation={creation}
      />
    );
  }

  return (
    <Combobox
      aria-label={constraint.label}
      options={options}
      value={selected[0] ?? null}
      onValueChange={(option) => onChange(option ? [option.value] : [])}
      getOptionValue={(option) => option.value}
      getOptionLabel={(option) => option.label}
      shouldFilter={false}
      includeMissingSelectedOptions
      onInputValueChange={setSearch}
      isLoading={isFetching}
      isError={isError}
      size="sm"
      emptyMessage={emptyMessage}
      placeholder="Choose a value..."
      creation={creation}
    />
  );
};
