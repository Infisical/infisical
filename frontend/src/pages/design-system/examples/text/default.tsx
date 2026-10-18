import { Heading, Meta, SmallText, Text } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      {(["display", "page", "section", "subsection"] as const).map((size) => (
        <ExampleCell key={size} label={size}>
          <Heading level={3} size={size}>
            Credential rotation
          </Heading>
        </ExampleCell>
      ))}
      <ExampleCell label="Text">
        <Text>Rotate credentials before the current version expires.</Text>
      </ExampleCell>
      <ExampleCell label="SmallText">
        <SmallText>Changes apply to new credentials.</SmallText>
      </ExampleCell>
      <ExampleCell label="Meta, mono">
        <Meta>2026-09-14 10:00 UTC</Meta>
      </ExampleCell>
      <ExampleCell label="Meta, plain">
        <Meta mono={false}>Updated 2 hours ago</Meta>
      </ExampleCell>
    </ExampleGrid>
  );
}
