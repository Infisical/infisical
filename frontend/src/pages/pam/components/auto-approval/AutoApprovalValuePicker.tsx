import { useEffect, useMemo, useState } from "react";
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

  // A picked value keeps its label while a search shows other options, such as a schedule's name for its ID
  const [labels, setLabels] = useState(() => new Map<string, string>());
  useEffect(() => {
    if (!options.length) return;
    setLabels(
      (current) =>
        new Map([...current, ...options.map(({ value, label }) => [value, label] as const)])
    );
  }, [options]);

  // Saved values outside the first page of options get their labels from one extra lookup
  const unlabelled = values.filter((value) => !labels.has(value));
  const { data: savedOptions } = useQuery({
    ...approvalPolicyQuery.autoApprovalOptions({
      policyType,
      scope,
      scopeId,
      connectionId,
      subject,
      constraint: constraint.id,
      search: "",
      siblings,
      selected: unlabelled
    }),
    enabled: constraint.hasOptions && !isFetching && options.length > 0 && unlabelled.length > 0,
    staleTime: 30_000,
    retry: false
  });
  useEffect(() => {
    if (!savedOptions?.length) return;
    setLabels(
      (current) =>
        new Map([...current, ...savedOptions.map(({ value, label }) => [value, label] as const)])
    );
  }, [savedOptions]);

  const selected = useMemo(
    () =>
      values.map(
        (value): TAutoApprovalOption =>
          options.find((option) => option.value === value) ?? {
            value,
            label: labels.get(value) ?? value
          }
      ),
    [values, options, labels]
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
