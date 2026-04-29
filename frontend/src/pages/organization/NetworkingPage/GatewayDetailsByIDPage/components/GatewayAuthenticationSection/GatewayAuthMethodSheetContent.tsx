import { useState } from "react";

import { Field, FieldContent, FieldLabel, FilterableSelect } from "@app/components/v3";
import { GatewayAuthMethodView } from "@app/hooks/api/gateways-v2/types";

import { GatewayAwsAuthForm } from "./GatewayAwsAuthForm";
import { GatewayTokenAuthPanel } from "./GatewayTokenAuthPanel";

// Settable methods only — identity is read-only. The currently-attached method is preselected
// so an operator coming in to "edit AWS config" lands on the AWS form by default.
type SettableMethod = "aws" | "token";

const METHOD_OPTIONS: { value: SettableMethod; label: string }[] = [
  { value: "token", label: "Token Auth" },
  { value: "aws", label: "AWS Auth" }
];

type Props = {
  gatewayId: string;
  currentMethod: GatewayAuthMethodView;
  onClose: () => void;
};

export const GatewayAuthMethodSheetContent = ({ gatewayId, currentMethod, onClose }: Props) => {
  const initial: SettableMethod = currentMethod.method === "aws" ? "aws" : "token";
  const [method, setMethod] = useState<SettableMethod>(initial);

  const selectedOption = METHOD_OPTIONS.find((o) => o.value === method) ?? METHOD_OPTIONS[0];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border p-4">
        <Field>
          <FieldLabel>Auth Method</FieldLabel>
          <FieldContent>
            <FilterableSelect
              value={selectedOption}
              onChange={(opt) => {
                const selected = opt as { value: SettableMethod } | null;
                if (selected) setMethod(selected.value);
              }}
              options={METHOD_OPTIONS}
              isSearchable={false}
              isClearable={false}
              getOptionLabel={(option) => option.label}
              getOptionValue={(option) => option.value}
            />
          </FieldContent>
        </Field>
      </div>

      {method === "aws" && (
        <GatewayAwsAuthForm
          gatewayId={gatewayId}
          existingConfig={currentMethod.method === "aws" ? currentMethod.config : null}
          onClose={onClose}
        />
      )}

      {method === "token" && (
        <GatewayTokenAuthPanel
          gatewayId={gatewayId}
          isAlreadyOnToken={currentMethod.method === "token"}
          onClose={onClose}
        />
      )}
    </div>
  );
};
