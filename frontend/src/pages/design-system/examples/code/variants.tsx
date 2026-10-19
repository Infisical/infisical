import { Code } from "@app/components/v4/ui/code";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const samples = [
  ["shell", "export INFISICAL_ENV='staging'"],
  ["env", "INFISICAL_ENV=staging"],
  ["json", '{"enabled":true,"count":9007199254740993}'],
  ["yaml", "enabled: true"],
  ["javascript", 'const environment = "staging";'],
  ["typescript", 'const environment: string = "staging";'],
  ["python", 'environment = "staging"'],
  ["hcl", 'environment = "staging"'],
  ["unknown-language", "  exact unchanged text  "]
] as const;
export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell label="Plain">
        <Code block format="plain" code={'  "staging"\t9007199254740993\n'} />
      </ExampleCell>
      {samples.map(([language, code]) => (
        <ExampleCell key={language} label={language}>
          <Code block language={language} code={code} />
        </ExampleCell>
      ))}
      <ExampleCell label="Wrapped and bounded">
        <Code
          block
          wrap
          maxLines={3}
          lineNumbers
          highlight={[2]}
          code={Array.from(
            { length: 8 },
            (_, index) =>
              `Version ${index + 1}: applications/staging/services/payment-processing/configuration`
          ).join("\n")}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
