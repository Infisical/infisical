import { useState } from "react";

import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v4/ui/input-group";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [values, setValues] = useState({
    xs: "draft",
    sm: "draft",
    "icon-xs": "draft",
    "icon-sm": "draft"
  });
  return (
    <ExampleGrid width="field">
      {(["xs", "sm", "icon-xs", "icon-sm"] as const).map((size) => (
        <ExampleCell key={size} label={size}>
          <Field label={`${size} action`}>
            <InputGroup>
              <InputGroupInput
                value={values[size]}
                onChange={(event) => setValues({ ...values, [size]: event.target.value })}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size={size}
                  aria-label={`Clear ${size} draft`}
                  disabled={!values[size]}
                  onClick={() => setValues({ ...values, [size]: "" })}
                >
                  {size.startsWith("icon") ? <Icon name="x" /> : "Clear"}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
