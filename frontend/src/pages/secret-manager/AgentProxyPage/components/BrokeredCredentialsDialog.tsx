import { ReactNode } from "react";
import { ArrowRightIcon, EyeOffIcon, TerminalIcon } from "lucide-react";

import {
  Badge,
  Button,
  CopyButton,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import {
  AgentPolicyCredentialRole,
  TAgentPolicy,
  TAgentPolicyCredential
} from "@app/hooks/api/agentPolicies";

import { PolicyTargetIcon } from "./PolicyTargetCell";

const SURFACE_LABEL: Record<string, string> = {
  header: "headers",
  path: "the path",
  query: "the query string",
  body: "the body"
};

const joinSurfaces = (surfaces: string[]) => {
  const labels = surfaces.map((surface) => SURFACE_LABEL[surface] ?? surface);
  if (labels.length < 2) return labels[0] ?? "the request";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
};

const SecretReference = ({ credential }: { credential: TAgentPolicyCredential }) => (
  <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
    <Badge variant="neutral">{credential.environment}</Badge>
    <span className="font-mono text-muted">{credential.secretPath}</span>
    <span className="min-w-0 font-mono break-all text-foreground">{credential.secretKey}</span>
  </div>
);

const Panel = ({
  title,
  caption,
  children
}: {
  title: ReactNode;
  caption: string;
  children: ReactNode;
}) => (
  <div className="flex min-w-0 flex-1 basis-0 flex-col gap-2 self-stretch rounded-md border border-border bg-container/30 p-3">
    <div className="flex min-w-0 items-center gap-1.5 truncate text-[11px] tracking-wide text-label uppercase">
      {title}
    </div>
    {children}
    <p className="mt-auto text-xs text-muted">{caption}</p>
  </div>
);

// What the agent holds next to what actually leaves the proxy. The two are never the same value, which
// is the whole point of the substitution and is otherwise invisible in the product.
const CredentialRow = ({
  credential,
  hostPattern,
  target
}: {
  credential: TAgentPolicyCredential;
  hostPattern: string;
  target: string;
}) => {
  const isSubstitution = credential.role === AgentPolicyCredentialRole.CredentialSubstitution;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="font-mono text-sm text-foreground">{credential.slotKey}</p>
        <Badge variant="neutral">
          {isSubstitution ? "Substituted on the wire" : "Added by the proxy"}
        </Badge>
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Panel
          title={
            <>
              <TerminalIcon className="size-3" />
              In the agent&apos;s environment
            </>
          }
          caption={
            isSubstitution
              ? "A fabricated value. Anywhere the agent sends it, the proxy swaps in the real secret."
              : "The agent sends no credential at all for this host."
          }
        >
          {isSubstitution && credential.placeholderKey ? (
            <div className="flex items-center gap-1">
              <code className="min-w-0 truncate rounded bg-container px-2 py-1 font-mono text-xs text-foreground">
                {credential.placeholderKey}={credential.placeholderValue}
              </code>
              <CopyButton
                value={`${credential.placeholderKey}=${credential.placeholderValue}`}
                ariaLabel="Copy placeholder"
              />
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <EyeOffIcon className="size-3.5" />
              Nothing
            </p>
          )}
        </Panel>

        <ArrowRightIcon className="mx-auto size-4 shrink-0 rotate-90 text-muted sm:rotate-0" />

        <Panel
          title={
            <>
              <PolicyTargetIcon target={target} />
              On the wire to {hostPattern}
            </>
          }
          caption={
            isSubstitution
              ? `The real value of the secret below, swapped in wherever the decoy appears in ${joinSurfaces(credential.substitutionSurfaces)}.`
              : `Set as ${credential.headerName}${credential.headerPrefix ? ` ${credential.headerPrefix} …` : ""} by the proxy.`
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 truncate rounded bg-container px-2 py-1 font-mono text-xs text-foreground">
              {isSubstitution
                ? "••••••••••••••••"
                : `${credential.headerPurpose ?? credential.headerName}: ${
                    credential.headerPrefix ? `${credential.headerPrefix} ` : ""
                  }••••••••`}
            </code>
          </div>
          <SecretReference credential={credential} />
        </Panel>
      </div>
    </div>
  );
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  policy?: TAgentPolicy;
};

export const BrokeredCredentialsDialog = ({ isOpen, onOpenChange, policy }: Props) => {
  const hostPattern = policy?.rules[0]?.hostPattern ?? "the upstream";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Brokered Credentials</DialogTitle>
          <DialogDescription>
            What {policy?.name} hands the agent, and what the proxy puts on the request instead.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          {policy?.credentials.length ? (
            policy.credentials.map((credential) => (
              <CredentialRow
                key={credential.id}
                credential={credential}
                hostPattern={hostPattern}
                target={policy.target}
              />
            ))
          ) : (
            <p className="text-sm text-label">
              This policy brokers no credentials. It only decides which requests are allowed
              through.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
