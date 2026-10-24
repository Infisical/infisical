import { Input } from "@app/components/v4/ui/input";
import { Kbd, KbdGroup } from "@app/components/v4/ui/kbd";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell label="Chord in a sentence">
        <p>
          Search with <Kbd keys="mod+K" />
        </p>
      </ExampleCell>
      <ExampleCell label="Sequence">
        <p>
          Go to secrets <Kbd keys={[["g"], ["s"]]} />
        </p>
      </ExampleCell>
      <ExampleCell label="Key legend">
        <KbdGroup>
          <Kbd>enter</Kbd>
          <span>confirms</span>
          <Kbd>esc</Kbd>
          <span>cancels</span>
        </KbdGroup>
      </ExampleCell>
      <ExampleCell label="Input hint">
        <Input aria-label="Filter secrets" placeholder="Filter by name" kbd="mod+K" />
      </ExampleCell>
    </ExampleGrid>
  );
}
