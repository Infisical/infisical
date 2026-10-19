import { Button } from "@app/components/v4/ui/button";
import { CodeBlock } from "@app/components/v4/ui/code-block";

import { ExampleCell, ExampleGrid } from "../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Syntax and header actions">
        <CodeBlock
          label="environment.env"
          icon="file"
          language="env"
          lineNumbers
          highlight={[2]}
          code={"INFISICAL_ENV=staging\nLOG_LEVEL=info"}
          actions={
            <Button asChild variant="link">
              <a href="#code">Syntax guide</a>
            </Button>
          }
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Headerless, copy disabled">
        <CodeBlock copyable={false} code="INFISICAL_ENV=staging" />
      </ExampleCell>
      <ExampleCell align="stretch" label="Custom content, explicit copy value">
        <CodeBlock copyValue="staging" copyLabel="Copy environment">
          <p>Environment: staging</p>
        </CodeBlock>
      </ExampleCell>
      <ExampleCell align="stretch" label="Custom content, no copy source">
        <CodeBlock>
          <p>Environment: staging</p>
        </CodeBlock>
      </ExampleCell>
    </ExampleGrid>
  );
}
