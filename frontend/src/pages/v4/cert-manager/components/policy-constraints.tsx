import { Badge } from "@infisical/cipher/ui/badge";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { SmallText } from "@infisical/cipher/ui/text";

import { POLICY_STATE_LABELS, type PolicyConstraints } from "./policy-model";

import styles from "./policy-constraints.module.css";

export const ConstraintList = ({
  rule,
  format = (value: string) => value,
  mono
}: {
  rule: PolicyConstraints;
  format?: (value: string) => string;
  mono?: boolean;
}) => (
  <Stack gap={8}>
    {(["required", "allowed", "denied"] as const).map((state) => {
      const values = rule[state];
      if (!values?.length) return null;
      return (
        <Inline key={state} gap={4} align="baseline">
          <SmallText muted className={styles.qualifier}>
            {POLICY_STATE_LABELS[state]}
          </SmallText>
          <Inline gap={4} className={styles.values}>
            {values.map((value) => (
              <Badge key={value} tone="outline" mono={mono}>
                {format(value)}
              </Badge>
            ))}
          </Inline>
        </Inline>
      );
    })}
  </Stack>
);
