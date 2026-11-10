import { useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import { Button } from "@app/components/v4/ui/button";
import { Stack } from "@app/components/v4/ui/layout";

import { ExampleCell } from "../../example-presentation";

const versions = [
  "Version 6, edited by maya@acme.test",
  "Version 5, edited by ci-deployer",
  "Version 4, edited by maya@acme.test",
  "Version 3, edited by jordan.lee@acme.test",
  "Version 2, edited by ci-deployer",
  "Version 1, created by jordan.lee@acme.test"
];

export default function Example() {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? versions : versions.slice(0, 2);
  return (
    <ExampleCell
      align="stretch"
      label={expanded ? "All six versions, grown after opening" : "Two of six versions"}
    >
      <Accordion type="single" collapsible defaultValue="history">
        <AccordionItem value="history">
          <AccordionTrigger>Version history</AccordionTrigger>
          <AccordionContent>
            <Stack gap={8} align="start">
              {shown.map((version) => (
                <span key={version}>{version}</span>
              ))}
              <Button variant="link" onClick={() => setExpanded((current) => !current)}>
                {expanded ? "Show fewer" : `Show all ${versions.length} versions`}
              </Button>
            </Stack>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </ExampleCell>
  );
}
