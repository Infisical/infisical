import { Code } from "@app/components/v4/ui/code";
import { Highlight } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Inline Code with a search match">
        <p>
          Set{" "}
          <Code>
            <Highlight text="DATABASE_REPLICA_URL" query="replica" />
          </Code>{" "}
          before the replica starts.
        </p>
      </ExampleCell>
    </ExampleGrid>
  );
}
