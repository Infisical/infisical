import { ReactNode, useMemo, useState } from "react";
import { SiPython, SiTypescript } from "react-icons/si";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button, CodeBlock, Tabs, TabsList, TabsTrigger } from "@app/components/v3";
import { useTimedReset } from "@app/hooks";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";
import { codeLanguageForFile, highlight } from "./highlightCode";
import {
  hasScriptLanguages,
  sandboxScripts,
  ScriptLanguage,
  ScriptProvider as SandboxPlatform,
  TSandboxScript
} from "./sandboxSnippets";

export { SandboxPlatform };

type TPlatformDetails = {
  name: string;
  logo: string;
  description: string;
  guideUrl: string;
};

export const PLATFORMS: Record<SandboxPlatform, TPlatformDetails> = {
  [SandboxPlatform.Modal]: {
    name: "Modal",
    logo: "/images/integrations/Modal.svg",
    description: "The proxy runs in a sidecar next to each sandbox, so nothing else can reach it.",
    guideUrl: AgentVaultDocsUrls.modalGuide
  },
  [SandboxPlatform.Daytona]: {
    name: "Daytona",
    logo: "/images/integrations/Daytona.png",
    description:
      "The proxy runs in its own sandbox, and only the agent's linked sandbox can reach it.",
    guideUrl: AgentVaultDocsUrls.daytonaGuide
  },
  [SandboxPlatform.E2B]: {
    name: "E2B",
    logo: "/images/integrations/E2B.svg",
    description: "Each sandbox sends its traffic to one proxy you run, over SOCKS5.",
    guideUrl: AgentVaultDocsUrls.e2bGuide
  },
  [SandboxPlatform.Docker]: {
    name: "Docker",
    logo: "/images/integrations/Docker.png",
    description:
      "The proxy runs in a container beside each agent's container, on a network with no internet access.",
    guideUrl: AgentVaultDocsUrls.dockerGuide
  },
  [SandboxPlatform.Kubernetes]: {
    name: "Kubernetes",
    logo: "/images/integrations/Kubernetes.png",
    description:
      "The proxy runs in your cluster, and an orchestrator starts each agent's pod with its own session.",
    guideUrl: AgentVaultDocsUrls.kubernetesSetupGuide
  },
  [SandboxPlatform.Cursor]: {
    name: "Cursor Cloud Agents",
    logo: "/images/integrations/Cursor.svg",
    description:
      "Self-hosted workers in your Kubernetes cluster, where a spawn hook gives each run its own session.",
    guideUrl: AgentVaultDocsUrls.cursorGuide
  }
};

const LANGUAGE_NAMES: Record<ScriptLanguage, string> = {
  [ScriptLanguage.TypeScript]: "TypeScript",
  [ScriptLanguage.Python]: "Python"
};

type TPromptValues = {
  language?: ScriptLanguage;
  siteUrl: string;
  projectId: string;
  accessBundle: string;
  clientId: string | null;
};

export const setupPrompt = (platform: TPlatformDetails, values: TPromptValues) =>
  [
    `Set up my code to run an AI agent in ${platform.name} with Infisical Agent Vault, following this guide: ${platform.guideUrl}`,
    "",
    `- Infisical URL: ${values.siteUrl}`,
    `- Project ID: ${values.projectId}`,
    `- Access bundle: ${values.accessBundle}`,
    ...(values.clientId ? [`- Machine identity client ID: ${values.clientId}`] : []),
    `- Language: ${values.language ? LANGUAGE_NAMES[values.language] : "the language my codebase already uses"}`,
    "",
    "Read the guide first, then adapt its code to my codebase. My code creates each session as a machine identity, with the client ID and client secret in INFISICAL_UNIVERSAL_AUTH_CLIENT_ID and INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET. Never put those credentials or the proxy token where the agent can read them."
  ].join("\n");

const ScriptPreview = ({ script }: { script: TSandboxScript }) => {
  const highlighted = useMemo(
    () => highlight(script.code, codeLanguageForFile(script.fileName)),
    [script]
  );

  return (
    <CodeBlock value={script.code} aria-label={script.fileName}>
      {highlighted}
    </CodeBlock>
  );
};

export const CopyPromptButton = ({ prompt }: { prompt: string }) => {
  const [, isCopied, setCopied] = useTimedReset<string>({ initialState: "" });

  return (
    <Button
      variant="av"
      onClick={() => {
        navigator.clipboard.writeText(prompt);
        setCopied("copied");
      }}
    >
      {isCopied ? <CheckIcon /> : <CopyIcon />}
      {isCopied ? "Copied" : "Copy Prompt"}
    </Button>
  );
};

type Props = {
  platform: SandboxPlatform;
  language: ScriptLanguage;
  onLanguageChange: (language: ScriptLanguage) => void;
  siteUrl: string;
  projectId: string;
  accessBundle: string;
  values: ReactNode;
};

export const SandboxPlatformPanel = ({
  platform,
  language,
  onLanguageChange,
  siteUrl,
  projectId,
  accessBundle,
  values
}: Props) => {
  const hasLanguages = hasScriptLanguages(platform);
  const scripts = sandboxScripts(platform, language, { siteUrl, projectId, accessBundle });
  // An index, since the same file has a different name in each language.
  const [fileIndex, setFileIndex] = useState(0);
  const activeIndex = Math.min(fileIndex, scripts.length - 1);
  const activeScript = scripts[activeIndex];

  return (
    <div className="flex flex-col gap-4">
      {values}

      {hasLanguages && (
        <Tabs value={language} onValueChange={(value) => onLanguageChange(value as ScriptLanguage)}>
          <TabsList aria-label="Language">
            <TabsTrigger value={ScriptLanguage.TypeScript}>
              <SiTypescript />
              TypeScript
            </TabsTrigger>
            <TabsTrigger value={ScriptLanguage.Python}>
              <SiPython />
              Python
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <Tabs value={String(activeIndex)} onValueChange={(value) => setFileIndex(Number(value))}>
        <TabsList variant="av" aria-label="Files">
          {scripts.map((script, index) => (
            <TabsTrigger key={script.fileName} value={String(index)}>
              {script.fileName}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {activeScript && <ScriptPreview key={activeScript.fileName} script={activeScript} />}
    </div>
  );
};
