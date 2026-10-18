import * as UI from "@app/components/v4/ui/accordion";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <UI.Accordion type="single" collapsible>
        <UI.AccordionItem value="retention">
          <UI.AccordionTrigger>Retention policy</UI.AccordionTrigger>
          <UI.AccordionContent>Versions remain available for 30 days.</UI.AccordionContent>
        </UI.AccordionItem>
        <UI.AccordionItem value="locked" disabled>
          <UI.AccordionTrigger>Organization policy</UI.AccordionTrigger>
          <UI.AccordionContent>Managed by administrators.</UI.AccordionContent>
        </UI.AccordionItem>
      </UI.Accordion>
    </ExampleStack>
  );
}
