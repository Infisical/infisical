import { CodeBlock } from "@app/components/v4/ui/code-block";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="wide">
      <ExampleCell align="stretch" label="File, framed shell">
        <CodeBlock
          label="environment.env"
          icon="file"
          language="env"
          lineNumbers
          highlight={[2]}
          code={"INFISICAL_ENV=staging\nLOG_LEVEL=info\nAPI_URL=https://example.com/api"}
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Terminal command">
        <CodeBlock
          label="Terminal"
          icon="terminal"
          language="bash"
          wrap
          code="infisical run --env=staging -- npm run dev"
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
