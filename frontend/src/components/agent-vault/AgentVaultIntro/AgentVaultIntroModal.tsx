import { ExternalLink, XIcon } from "lucide-react";

import introDiagram from "@app/assets/images/agent-vault-intro.png";
import { PreviewBadge } from "@app/components/agent-vault/PreviewBadge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton
} from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

const PARAGRAPHS = [
  "Run AI agents with the access, context, and capabilities they need to do work. Today that means secure access to the services they call: LLM providers, GitHub, Slack, and more.",
  "You describe what an agent may reach in an access bundle and grant it to whoever runs agents. They create a session to launch with, and a proxy in your network attaches the real credential on the way out, only for the services you allowed and only until the session expires."
];

const LINKS = [
  { label: "Documentation", href: AgentVaultDocsUrls.overview },
  { label: "Quickstart", href: AgentVaultDocsUrls.quickstart }
];

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AgentVaultIntroModal = ({ isOpen, onOpenChange }: Props) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent
      className="max-w-xl gap-0 p-0"
      showCloseButton={false}
      onOpenAutoFocus={(event) => {
        // PreviewBadge is focusable so keyboard users can reach its tooltip, which also makes it
        // the first focusable child here. Radix would autofocus it on open and the tooltip would
        // appear with nobody hovering, so hold focus on the dialog itself.
        event.preventDefault();
        (event.currentTarget as HTMLElement).focus({ preventScroll: true });
      }}
    >
      <img
        src={introDiagram}
        alt="An agent picks up a request from Slack and calls out through the Agent Proxy, which checks policy, brokers the credential from Infisical, and forwards the call to Anthropic, Sentry and GitHub."
        className="aspect-video w-full border-b border-border bg-black object-contain"
      />
      <div className="flex flex-col gap-4 p-6">
        <DialogHeader className="flex-row items-center gap-2">
          <DialogTitle>Introducing Agent Vault</DialogTitle>
          <PreviewBadge type={ProjectType.AgentVault} />
        </DialogHeader>
        <DialogDescription className="whitespace-pre-line">
          {PARAGRAPHS.join("\n\n")}
        </DialogDescription>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-foreground underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          ))}
        </div>
      </div>
      <DialogClose asChild>
        <IconButton
          aria-label="Close"
          variant="ghost"
          size="xs"
          className="absolute top-3 right-3 bg-popover/80 backdrop-blur-sm hover:bg-container-hover"
        >
          <XIcon />
        </IconButton>
      </DialogClose>
    </DialogContent>
  </Dialog>
);
