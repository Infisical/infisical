import * as React from "react";

import { Code } from "@app/components/v4/ui/code";
import * as UI from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Highlight } from "@app/components/v4/ui/text";

import { ExampleStack } from "../../example-presentation";

const variables = [
  { key: "SMTP_HOST", description: "Hostname of the SMTP server that sends invites and alerts." },
  { key: "SMTP_PORT", description: "Port the SMTP server listens on, usually 587." }
];

export default function Example() {
  const [query, setQuery] = React.useState("smtp");
  return (
    <ExampleStack>
      <Input
        aria-label="Search keys and descriptions"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <UI.FieldGroup>
        {variables.map((variable) => (
          <UI.Field
            key={variable.key}
            label={
              <Code>
                <Highlight text={variable.key} query={query} />
              </Code>
            }
            description={<Highlight text={variable.description} query={query} />}
          >
            <Input defaultValue="" />
          </UI.Field>
        ))}
      </UI.FieldGroup>
    </ExampleStack>
  );
}
