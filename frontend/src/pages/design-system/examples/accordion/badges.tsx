import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import { Badge } from "@app/components/v4/ui/badge";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Text and a badge; hover underlines the text only">
        <Accordion type="single" collapsible defaultValue="saml">
          <AccordionItem value="saml">
            <AccordionTrigger>
              SAML single sign-on
              <Badge tone="ok" size="sm">
                Enabled
              </Badge>
            </AccordionTrigger>
            <AccordionContent>Members sign in through Okta.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="ldap">
            <AccordionTrigger>
              LDAP
              <Badge tone="soft" size="sm">
                Not configured
              </Badge>
            </AccordionTrigger>
            <AccordionContent>Connect a directory to sync groups.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </ExampleCell>
    </ExampleGrid>
  );
}
