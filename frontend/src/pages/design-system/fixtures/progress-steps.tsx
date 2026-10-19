import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { ProgressSteps } from "@app/components/v4/ui/progress";

import { ExampleStack } from "../example-presentation";

export default function Example() {
  const [current, setCurrent] = useState(1);
  return (
    <ExampleStack>
      <ProgressSteps
        label="Connection setup"
        steps={["Source", "Review", "Connect"]}
        current={current}
      />
      <Button variant="outline" onClick={() => setCurrent((current + 1) % 3)}>
        Next stage
      </Button>
    </ExampleStack>
  );
}
