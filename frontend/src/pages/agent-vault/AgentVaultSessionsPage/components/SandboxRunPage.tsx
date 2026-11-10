import { Link } from "@tanstack/react-router";
import { CheckIcon, CopyIcon, ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CodeBlock
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { TAgentVaultMintedSession } from "@app/hooks/api/agentVault/types";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";
import { formatSessionExpiry } from "./SessionExpiry";
import { SnippetLanguage } from "./sessionSnippets";

const runCommand = (token: string, siteUrl: string) =>
  `infisical agent-vault run \\
  --session-token ${token} \\
  --proxy <proxy-host>:17323 \\
  --domain ${siteUrl} \\
  -- <agent-command>`;

type TSandboxPlatform = {
  name: string;
  logo: string;
  description: string;
  guideUrl: string;
};

const PLATFORMS: TSandboxPlatform[] = [
  {
    name: "Modal",
    logo: "/images/integrations/Modal.svg",
    description: "The proxy runs in a sidecar next to each sandbox.",
    guideUrl: AgentVaultDocsUrls.modalGuide
  },
  {
    name: "Daytona",
    logo: "/images/integrations/Daytona.png",
    description: "The proxy runs in its own sandbox, linked to the agent's.",
    guideUrl: AgentVaultDocsUrls.daytonaGuide
  },
  {
    name: "E2B",
    logo: "/images/integrations/E2B.svg",
    description: "Each sandbox sends its traffic to your proxy over SOCKS5.",
    guideUrl: AgentVaultDocsUrls.e2bGuide
  },
  {
    name: "Docker",
    logo: "/images/integrations/Docker.png",
    description: "The proxy runs in a container beside each agent's container.",
    guideUrl: AgentVaultDocsUrls.dockerGuide
  },
  {
    name: "Kubernetes",
    logo: "/images/integrations/Kubernetes.png",
    description: "Agent pods can connect only to the proxy in your cluster.",
    guideUrl: AgentVaultDocsUrls.kubernetesGuide
  },
  {
    name: "Cursor Cloud Agents",
    logo: "/images/integrations/Cursor.svg",
    description: "Self-hosted workers in your Kubernetes cluster, with no credentials in the pods.",
    guideUrl: AgentVaultDocsUrls.cursorGuide
  }
];

type TPromptValues = {
  language: SnippetLanguage;
  siteUrl: string;
  projectId: string;
  accessBundle: string;
};

const PROMPT_LANGUAGES: Record<SnippetLanguage, string> = {
  [SnippetLanguage.TypeScript]: "TypeScript",
  [SnippetLanguage.Python]: "Python",
  [SnippetLanguage.Cli]: "the language my codebase already uses"
};

const setupPrompt = (platform: TSandboxPlatform, values: TPromptValues) => {
  const language = PROMPT_LANGUAGES[values.language];

  return `Set up my code to run an AI agent in ${platform.name} with Infisical Agent Vault, following this guide: ${platform.guideUrl}

- Infisical URL: ${values.siteUrl}
- Project ID: ${values.projectId}
- Access bundle: ${values.accessBundle}
- Language: ${language}

Read the guide first, then adapt its code to my codebase. My code creates each session as a machine identity, with the client ID and client secret in INFISICAL_UNIVERSAL_AUTH_CLIENT_ID and INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET. Never put those credentials or the proxy token where the agent can read them.`;
};

const PlatformCard = ({ platform, prompt }: { platform: TSandboxPlatform; prompt: string }) => {
  const [, isCopied, setCopied] = useTimedReset<string>({ initialState: "" });

  return (
    <Card className="h-full gap-4 p-4">
      <CardHeader>
        <CardTitle className="text-base">
          <img src={platform.logo} alt="" className="size-5 shrink-0 rounded-sm object-contain" />
          {platform.name}
        </CardTitle>
        <CardDescription>{platform.description}</CardDescription>
      </CardHeader>
      <CardFooter className="mt-auto gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(prompt);
            setCopied("copied");
          }}
        >
          {isCopied ? <CheckIcon /> : <CopyIcon />}
          {isCopied ? "Copied" : "Copy Prompt"}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={platform.guideUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon />
            View Guide
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
};

type Props = {
  language: SnippetLanguage;
  accessBundle: string;
  siteUrl: string;
  hasProxy: boolean;
  session: TAgentVaultMintedSession | null;
};

export const SandboxRunPage = ({ language, accessBundle, siteUrl, hasProxy, session }: Props) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();

  return (
    <div className="flex flex-col gap-6">
      {session && (
        <div className="flex flex-col gap-4">
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              This command is shown once. Copy it now, since the session token cannot be retrieved
              later.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-2">
            <CodeBlock label="Run an agent with it" value={runCommand(session.token, siteUrl)} />
            <p className="text-xs text-accent">
              Run it where your agent runs. Replace{" "}
              <span className="font-mono">&lt;proxy-host&gt;</span> with the host your proxy runs on
              and <span className="font-mono">&lt;agent-command&gt;</span> with the agent to run,
              such as <span className="font-mono">claude</span>.{" "}
              {session.expiresAt
                ? `The session expires ${formatSessionExpiry(session.expiresAt)}.`
                : "The session lasts until someone revokes it."}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {session && <h3 className="text-sm font-medium">Run Agents in a Sandbox</h3>}
        <p className="text-sm text-accent">
          Pick where your agent runs. Copy a prompt that has your coding agent set it up, or follow
          the guide yourself.
          {!hasProxy && (
            <>
              {" "}
              This project has no proxy yet.{" "}
              <Link
                to="/organizations/$orgId/projects/agent-vault/$projectId/proxies"
                params={{ orgId: currentOrg.id, projectId }}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Create a proxy
              </Link>{" "}
              first.
            </>
          )}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform.name}
              platform={platform}
              prompt={setupPrompt(platform, { language, siteUrl, projectId, accessBundle })}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
