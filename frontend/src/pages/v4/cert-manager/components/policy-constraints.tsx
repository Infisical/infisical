import { Badge } from "@infisical/cipher/ui/badge";
import { Inline } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";

import { POLICY_STATE_LABELS, type PolicyConstraints } from "./policy-model";

export const ConstraintList = ({
  rule,
  format = (value: string) => value,
  mono
}: {
  rule: PolicyConstraints;
  format?: (value: string) => string;
  mono?: boolean;
}) => (
  <DataList
    variant="inline"
    labelWidth="cell-min"
    items={(["required", "allowed", "denied"] as const)
      .filter((state) => rule[state]?.length)
      .map((state) => [
        POLICY_STATE_LABELS[state],
        <Inline key={state} gap={4}>
          {rule[state]?.map((value) => (
            <Badge key={value} tone="outline" mono={mono}>
              {format(value)}
            </Badge>
          ))}
        </Inline>
      ])}
  />
);
