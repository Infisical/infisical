import * as UI from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline } from "@app/components/v4/ui/layout";
import { GlobPatternHelp, SecretPathInput } from "@app/components/v4/ui/secret-path-input";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <UI.FieldGroup>
        <UI.Field
          label="Lease TTL"
          help="How long a generated credential stays valid before it is revoked."
        >
          <Input mono defaultValue="1h" />
        </UI.Field>
        <UI.Field label="Secret path" help={<GlobPatternHelp />}>
          <SecretPathInput defaultValue="/app/**" />
        </UI.Field>
        <UI.Field>
          <Inline gap={4} wrap={false}>
            <UI.FieldLabel htmlFor="field-help-role">Role slug</UI.FieldLabel>
            <UI.FieldHelp label="About role slugs">
              Lowercase letters, numbers and hyphens.
            </UI.FieldHelp>
          </Inline>
          <Input id="field-help-role" mono defaultValue="read-only" />
        </UI.Field>
      </UI.FieldGroup>
    </ExampleStack>
  );
}
