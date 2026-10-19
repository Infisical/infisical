import { CodeBlock } from "@app/components/v4/ui/code-block";
import { Json } from "@app/components/v4/ui/json";

export default function Example() {
  return (
    <CodeBlock label="Synthetic exact payload" copyLabel="Copy redacted JSON">
      <Json
        value='{"count":9007199254740993,"note":"  exact  ","token":"synthetic-token"}'
        redact={["token"]}
      />
    </CodeBlock>
  );
}
