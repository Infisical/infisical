import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea
} from "@app/components/v4/ui/input-group";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="field">
      {(["inline-start", "inline-end", "block-start", "block-end"] as const).map((align) => (
        <ExampleCell key={align} label={align}>
          <Field label={`${align} query`}>
            <InputGroup>
              <InputGroupAddon align={align}>
                {align.startsWith("inline") ? (
                  <Icon name="search" />
                ) : (
                  <InputGroupText>Query</InputGroupText>
                )}
              </InputGroupAddon>
              {align.startsWith("inline") ? (
                <InputGroupInput defaultValue="payments" />
              ) : (
                <InputGroupTextarea rows={3} defaultValue="Select name from environments" />
              )}
            </InputGroup>
          </Field>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
