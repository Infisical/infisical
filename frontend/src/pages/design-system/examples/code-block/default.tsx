import { CodeBlock } from "@app/components/v4/ui/code-block";

export default function Example() {
  return (
    <CodeBlock
      label="environment.env"
      icon="file"
      language="env"
      lineNumbers
      highlight={[2]}
      code={"INFISICAL_ENV=staging\nLOG_LEVEL=info\nAPI_URL=https://example.com/api"}
    />
  );
}
