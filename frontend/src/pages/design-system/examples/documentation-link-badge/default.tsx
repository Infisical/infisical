import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { Heading } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const href = "https://infisical.com/docs/documentation/platform/gateways/overview";

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell label="default">
        <DocumentationLinkBadge href={href} />
      </ExampleCell>
      <ExampleCell label="minified">
        <DocumentationLinkBadge href={href} variant="minified" />
      </ExampleCell>
      <ExampleCell label="Beside a section title">
        <div className="flex items-center gap-2">
          <Heading level={3} size="subsection">
            Gateways
          </Heading>
          <DocumentationLinkBadge href={href} />
        </div>
      </ExampleCell>
    </ExampleGrid>
  );
}
