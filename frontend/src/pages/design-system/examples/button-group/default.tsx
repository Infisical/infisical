import { Button } from "@app/components/v4/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText
} from "@app/components/v4/ui/button-group";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="field">
      <ExampleCell label="attached">
        <ButtonGroup label="Version history">
          <Button variant="outline" icon="chev-left">
            Older
          </Button>
          <ButtonGroupText>v12</ButtonGroupText>
          <Button variant="outline" iconRight="chev-right">
            Newer
          </Button>
        </ButtonGroup>
      </ExampleCell>
      <ExampleCell label="toolbar">
        <ButtonGroup variant="toolbar" label="Secret actions">
          <Button variant="ghost" icon="copy" iconOnly aria-label="Copy value" />
          <Button variant="ghost" icon="download" iconOnly aria-label="Download" />
          <ButtonGroupSeparator />
          <Button variant="ghost" icon="trash" iconOnly aria-label="Delete" />
        </ButtonGroup>
      </ExampleCell>
    </ExampleGrid>
  );
}
