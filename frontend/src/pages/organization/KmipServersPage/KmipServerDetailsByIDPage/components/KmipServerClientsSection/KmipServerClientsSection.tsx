import { ArrowUpRightIcon, BookOpenIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

const STEPS = [
  "Deploy this KMIP server on a target host (see Deployment above).",
  "Create a KMIP client in a KMS project's KMIP settings.",
  "Generate a client certificate for that client.",
  "Point your KMIP application at the server address using the client certificate."
];

export const KmipServerClientsSection = () => {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Connecting KMIP Clients</CardTitle>
        <CardDescription>
          KMIP clients authenticate to this server with a client certificate to run key operations.
          Clients are managed per-project from a KMS project&apos;s KMIP settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-y-3">
          {STEPS.map((step, idx) => (
            <li key={step} className="flex items-start gap-x-3 text-sm text-mineshaft-300">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-mineshaft-600 text-xs font-medium text-mineshaft-200">
                {idx + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <a
            href="https://infisical.com/docs/documentation/platform/kms/kmip"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-x-2 text-sm text-mineshaft-300 transition-colors hover:text-mineshaft-100"
          >
            <BookOpenIcon className="size-4" />
            View docs
            <ArrowUpRightIcon className="size-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
};
