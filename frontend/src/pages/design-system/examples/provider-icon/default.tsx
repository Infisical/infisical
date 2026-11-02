import { ProviderIcon } from "@app/components/v4/ui/provider-icon";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell label="sm">
        <ProviderIcon icon="Amazon Web Services.png" alt="AWS logo" size="sm" />
      </ExampleCell>
      <ExampleCell label="md">
        <ProviderIcon icon="Amazon Web Services.png" alt="AWS logo" />
      </ExampleCell>
      <ExampleCell label="lg">
        <ProviderIcon icon="Amazon Web Services.png" alt="AWS logo" size="lg" />
      </ExampleCell>
      <ExampleCell label="xl">
        <ProviderIcon icon="Amazon Web Services.png" alt="AWS logo" size="xl" />
      </ExampleCell>
      <ExampleCell label="Theme variants">
        <div className="flex items-center gap-3">
          <ProviderIcon icon="GitHub.png" alt="GitHub logo" size="xl" />
          <ProviderIcon icon="OpenAI.png" alt="OpenAI logo" size="xl" />
          <ProviderIcon icon="Anthropic.png" alt="Anthropic logo" size="xl" />
        </div>
      </ExampleCell>
      <ExampleCell label="Missing file, fallback">
        <ProviderIcon icon="Retired Provider.png" alt="Retired Provider logo" size="xl" />
      </ExampleCell>
    </ExampleGrid>
  );
}
