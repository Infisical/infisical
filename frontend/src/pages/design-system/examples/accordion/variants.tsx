import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Single, noncollapsible">
        <Accordion type="single" defaultValue="versions">
          <AccordionItem value="versions">
            <AccordionTrigger>Version retention</AccordionTrigger>
            <AccordionContent>Versions remain available for 30 days.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="policy">
            <AccordionTrigger>Access policy</AccordionTrigger>
            <AccordionContent>Read access expires after one hour.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </ExampleCell>
      <ExampleCell align="stretch" label="Multiple, both open">
        <Accordion type="multiple" defaultValue={["versions", "policy"]}>
          {["versions", "policy"].map((value) => (
            <AccordionItem key={value} value={value}>
              <AccordionTrigger>
                {value === "versions" ? "Version retention" : "Access policy"}
              </AccordionTrigger>
              <AccordionContent>
                {value === "versions"
                  ? "Versions remain available for 30 days."
                  : "Read access expires after one hour."}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </ExampleCell>
    </ExampleGrid>
  );
}
