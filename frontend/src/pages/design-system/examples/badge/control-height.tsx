import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline } from "@app/components/v4/ui/layout";

import { ExampleCell, ExampleStack } from "../../example-presentation";

const rows = [
  { label: "md (default), beside a 32px row", badge: "md", control: "sm", button: "default" },
  {
    label: "control-sm, beside Input sm and Button default",
    badge: "control-sm",
    control: "sm",
    button: "default"
  },
  {
    label: "control-md, beside Input md and Button md",
    badge: "control-md",
    control: "md",
    button: "md"
  },
  {
    label: "control-lg, beside Input lg and Button lg",
    badge: "control-lg",
    control: "lg",
    button: "lg"
  }
] as const;

export default function Example() {
  return (
    <ExampleStack>
      {rows.map((row) => (
        <ExampleCell key={row.badge} label={row.label}>
          <Inline gap={8} wrap={false}>
            <Badge tone="soft" size={row.badge}>
              <Icon name="key" />
              Access key ID
            </Badge>
            <Input
              size={row.control}
              mono
              aria-label={`Secret name, ${row.badge}`}
              defaultValue="AWS_ACCESS_KEY_ID"
            />
            <Button variant="outline" size={row.button}>
              Generate
            </Button>
          </Inline>
        </ExampleCell>
      ))}
    </ExampleStack>
  );
}
