import { useState } from "react";

import { Field } from "@app/components/v4/ui/field";
import { TagsInput } from "@app/components/v4/ui/tags-input";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const urnPrefix = "urn:";

export default function Example() {
  const [contexts, setContexts] = useState([
    "urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract",
    "urn:infisical:mfa:totp"
  ]);
  const [refusal, setRefusal] = useState<string>();
  const [labels, setLabels] = useState<string[]>([]);
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Mono values with validation">
        <Field label="MFA authentication contexts" error={refusal}>
          <TagsInput
            label="MFA authentication contexts"
            mono
            value={contexts}
            onChange={setContexts}
            invalid={Boolean(refusal)}
            validate={(tag) =>
              tag.startsWith(urnPrefix) ? undefined : `${tag} is not a URN. Start it with urn:`
            }
            onValidationChange={setRefusal}
            placeholder="urn:oasis:names:tc:SAML:2.0:ac:classes:..."
          />
        </Field>
      </ExampleCell>
      <ExampleCell align="stretch" label="Empty">
        <Field label="Labels" description="Press Enter or type a comma to add a label.">
          <TagsInput
            label="Labels"
            value={labels}
            onChange={setLabels}
            placeholder="payments, backend"
          />
        </Field>
      </ExampleCell>
      <ExampleCell align="stretch" label="Disabled">
        <Field label="Allowed domains">
          <TagsInput
            label="Allowed domains"
            defaultValue={["acme.test", "corp.acme.test"]}
            disabled
          />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
