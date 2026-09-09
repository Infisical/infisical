import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";

const STEPS = [
  "Deploy this KMIP server on a target host using the Deployment card above.",
  "Create a KMIP client in a KMS project's KMIP settings.",
  "Generate a client certificate for that client.",
  "Point your KMIP application at the server address using the client certificate."
];

export const KmipServerClientsSection = () => {
  return (
    <Card className="min-w-0" aria-labelledby="kmip-server-clients-title">
      <CardHeader>
        <CardTitle>
          <h2 id="kmip-server-clients-title">Connecting KMIP Clients</h2>
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/kms/kmip" />
        </CardTitle>
        <CardDescription>
          KMIP clients authenticate to this server with a client certificate to run key operations.
          Clients are managed per project from a KMS project&apos;s KMIP settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-y-3">
          {STEPS.map((step, idx) => (
            <li key={step} className="flex items-start gap-x-3 text-sm text-label">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-container text-xs font-medium text-foreground">
                {idx + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
};
