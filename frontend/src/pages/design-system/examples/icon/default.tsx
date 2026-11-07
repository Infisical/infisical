import { Icon, iconNames } from "@app/components/v4/ui/icon";

import { ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {iconNames.map((name) => (
        <span key={name} className="flex min-w-0 flex-col items-center gap-2 text-center text-sm">
          <Icon name={name} />
          <span>{name}</span>
        </span>
      ))}
    </ExampleGrid>
  );
}
