import { useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  const [open, setOpen] = useState("versions");
  return (
    <ExampleStack>
      <Accordion type="single" value={open} onValueChange={setOpen} collapsible>
        {["versions", "policy"].map((value) => (
          <AccordionItem key={value} value={value}>
            <AccordionTrigger>
              {value === "versions" ? "Version retention" : "Access policy"}
            </AccordionTrigger>
            <AccordionContent>Managed by project settings.</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p role="status" className="sr-only">
        {open ? `Open section: ${open}` : "All sections closed"}
      </p>
    </ExampleStack>
  );
}
