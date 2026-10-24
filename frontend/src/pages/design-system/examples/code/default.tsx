import { Code } from "@app/components/v4/ui/code";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <p>
        Set <Code>INFISICAL_ENV</Code> in your environment.
      </p>
      <Code
        block
        language="shell"
        lineNumbers
        highlight={[2]}
        code={"infisical login\ninfisical run -- npm start"}
      />
    </ExampleStack>
  );
}
