import { useState } from "react";

import { CodeBlock } from "@app/components/v4/ui/code-block";
import { Json } from "@app/components/v4/ui/json";

import { ExampleStack } from "../example-presentation";

export default function Example() {
  const [copied, setCopied] = useState("");
  return (
    <ExampleStack>
      <CodeBlock label="Synthetic audit payload" copyLabel="Copy safe payload" onCopy={setCopied}>
        <Json
          value='{"count":9007199254740993,"note":"  exact  ","token":"synthetic-token"}'
          redact={["token"]}
        />
      </CodeBlock>
      <p role="status" className="sr-only">
        {copied ? "Safe payload copied" : ""}
      </p>
    </ExampleStack>
  );
}
