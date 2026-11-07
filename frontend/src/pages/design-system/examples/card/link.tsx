import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card, CardLink } from "@app/components/v4/ui/card";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import { SmallText } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="wide">
      <ExampleCell
        align="stretch"
        label="Whole card opens Detail; the copy button and docs link keep their own click"
      >
        <Card variant="framed">
          <div className="flex items-start gap-3">
            <ProviderIcon icon="Infisical.png" alt="" size="xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <CardLink
                to="/design-system/components/$group/$component"
                params={{ group: "data-display", component: "detail" }}
              >
                Detail
              </CardLink>
              <SmallText muted>
                Stacked label and value pairs for the details of one resource.
              </SmallText>
              <div className="flex items-center gap-2">
                <Badge tone="soft">Data display</Badge>
                <Button variant="link" size="sm" asChild>
                  <a href="#row-link">Compare with RowLink</a>
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-row"
              icon="copy"
              iconOnly
              onClick={() => navigator.clipboard.writeText("detail")}
            >
              Copy the id of Detail
            </Button>
          </div>
        </Card>
      </ExampleCell>
      <ExampleCell align="stretch" label="Disabled: no href, no overlay">
        <Card variant="framed">
          <div className="flex items-start gap-3">
            <ProviderIcon icon="Kafka.png" alt="" size="xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <CardLink
                to="/design-system/components/$group/$component"
                params={{ group: "data-display", component: "detail" }}
                disabled
              >
                Unreleased page
              </CardLink>
              <SmallText muted>Opens once the page ships.</SmallText>
            </div>
          </div>
        </Card>
      </ExampleCell>
    </ExampleGrid>
  );
}
