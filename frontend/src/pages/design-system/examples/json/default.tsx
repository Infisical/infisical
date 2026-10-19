import { Json } from "@app/components/v4/ui/json";

export default function Example() {
  return (
    <Json
      value={{
        project: "production",
        events: [{ action: "secret.read", actor: "build-agent" }],
        credentials: { apiKey: "sample-secret" }
      }}
      redact={["apiKey"]}
      label="Audit event"
    />
  );
}
