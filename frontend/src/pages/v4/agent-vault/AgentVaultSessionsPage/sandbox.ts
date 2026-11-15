// The scripts are copied verbatim from the provider guides in
// docs/documentation/platform/agent-vault/guides/, which are tested end to end. Update them
// together, or the sheet hands out code the guide no longer recommends.
import cursorControllerDockerfile from "./sandbox-scripts/cursor-controller-dockerfile.txt?raw";
import cursorControllerManifest from "./sandbox-scripts/cursor-controller.yaml.txt?raw";
import cursorProxy from "./sandbox-scripts/cursor-proxy.yaml.txt?raw";
import cursorSpawnWorker from "./sandbox-scripts/cursor-spawn-worker.sh.txt?raw";
import cursorWorkerDockerfile from "./sandbox-scripts/cursor-worker-dockerfile.txt?raw";
import cursorWorkerEntrypoint from "./sandbox-scripts/cursor-worker-entrypoint.sh.txt?raw";
import cursorWorkerEnv from "./sandbox-scripts/cursor-worker-env.sh.txt?raw";
import cursorWorkersNamespace from "./sandbox-scripts/cursor-workers.yaml.txt?raw";
import daytonaImagePy from "./sandbox-scripts/daytona-image.py.txt?raw";
import daytonaImageTs from "./sandbox-scripts/daytona-image.ts.txt?raw";
import daytonaRunPy from "./sandbox-scripts/daytona-run.py.txt?raw";
import daytonaRunTs from "./sandbox-scripts/daytona-run.ts.txt?raw";
import dockerCompose from "./sandbox-scripts/docker-compose.yaml.txt?raw";
import dockerDockerfile from "./sandbox-scripts/docker-dockerfile.txt?raw";
import dockerRunAgent from "./sandbox-scripts/docker-run-agent.sh.txt?raw";
import e2bRunPy from "./sandbox-scripts/e2b-run.py.txt?raw";
import e2bRunTs from "./sandbox-scripts/e2b-run.ts.txt?raw";
import kubernetesAgentPod from "./sandbox-scripts/kubernetes-agent-pod.yaml.txt?raw";
import kubernetesAgentsNamespace from "./sandbox-scripts/kubernetes-agents-namespace.yaml.txt?raw";
import kubernetesDockerfile from "./sandbox-scripts/kubernetes-dockerfile.txt?raw";
import kubernetesOrchestratorRole from "./sandbox-scripts/kubernetes-orchestrator-role.yaml.txt?raw";
import kubernetesProxy from "./sandbox-scripts/kubernetes-proxy.yaml.txt?raw";
import kubernetesRunAgent from "./sandbox-scripts/kubernetes-run-agent.sh.txt?raw";
import modalImagePy from "./sandbox-scripts/modal-image.py.txt?raw";
import modalImageTs from "./sandbox-scripts/modal-image.ts.txt?raw";
import modalRunPy from "./sandbox-scripts/modal-run.py.txt?raw";
import modalRunTs from "./sandbox-scripts/modal-run.ts.txt?raw";
import { AGENT_VAULT_DOCS } from "./sessions";

export enum ScriptProvider {
  Modal = "modal",
  Daytona = "daytona",
  E2B = "e2b",
  Docker = "docker",
  Kubernetes = "kubernetes",
  Cursor = "cursor"
}

export enum ScriptLanguage {
  TypeScript = "typescript",
  Python = "python"
}

export type TSandboxScript = { fileName: string; code: string };

// A bare string names its file in a comment on its first line, which becomes the block's label.
// Files the guide names only in its prose carry their name here instead.
type TScriptSource = string | TSandboxScript;

const LANGUAGE_SCRIPTS: Partial<Record<ScriptProvider, Record<ScriptLanguage, TScriptSource[]>>> = {
  [ScriptProvider.Modal]: {
    [ScriptLanguage.TypeScript]: [modalImageTs, modalRunTs],
    [ScriptLanguage.Python]: [modalImagePy, modalRunPy]
  },
  [ScriptProvider.Daytona]: {
    [ScriptLanguage.TypeScript]: [daytonaImageTs, daytonaRunTs],
    [ScriptLanguage.Python]: [daytonaImagePy, daytonaRunPy]
  },
  [ScriptProvider.E2B]: {
    [ScriptLanguage.TypeScript]: [e2bRunTs],
    [ScriptLanguage.Python]: [e2bRunPy]
  }
};

const SHELL_SCRIPTS: Partial<Record<ScriptProvider, TScriptSource[]>> = {
  [ScriptProvider.Docker]: [
    dockerDockerfile,
    { fileName: "compose.yaml", code: dockerCompose },
    { fileName: "run-agent.sh", code: dockerRunAgent }
  ],
  [ScriptProvider.Kubernetes]: [
    { fileName: "agent-vault-proxy.yaml", code: kubernetesProxy },
    { fileName: "agents-namespace.yaml", code: kubernetesAgentsNamespace },
    { fileName: "agent-orchestrator-role.yaml", code: kubernetesOrchestratorRole },
    kubernetesDockerfile,
    { fileName: "agent-pod.yaml", code: kubernetesAgentPod },
    { fileName: "run-agent.sh", code: kubernetesRunAgent }
  ],
  [ScriptProvider.Cursor]: [
    cursorProxy,
    cursorWorkerEnv,
    // The shebang comes before the name, so the first line can't label it.
    { fileName: "worker/entrypoint.sh", code: cursorWorkerEntrypoint },
    cursorWorkerDockerfile,
    cursorControllerDockerfile,
    cursorWorkersNamespace,
    cursorControllerManifest,
    { fileName: "spawn-worker.sh", code: cursorSpawnWorker }
  ]
};

export const hasScriptLanguages = (provider: ScriptProvider) => Boolean(LANGUAGE_SCRIPTS[provider]);

type TSandboxValues = { siteUrl: string; projectId: string; accessBundle: string };

const fillIn = (code: string, values: TSandboxValues) =>
  code
    .replaceAll("https://app.infisical.com", values.siteUrl)
    .replaceAll("<project-id>", values.projectId)
    .replaceAll("<access-bundle-name>", values.accessBundle)
    .trimEnd();

const toScript = (source: TScriptSource, values: TSandboxValues): TSandboxScript => {
  if (typeof source !== "string") {
    return { fileName: source.fileName, code: fillIn(source.code, values) };
  }
  const [firstLine, ...rest] = fillIn(source, values).split("\n");
  return { fileName: firstLine.replace(/^(#|\/\/)\s*/, ""), code: rest.join("\n") };
};

export const sandboxScripts = (
  provider: ScriptProvider,
  language: ScriptLanguage,
  values: TSandboxValues
) =>
  (LANGUAGE_SCRIPTS[provider]?.[language] ?? SHELL_SCRIPTS[provider] ?? []).map((source) =>
    toScript(source, values)
  );

type TPlatformDetails = {
  name: string;
  logo: string;
  description: string;
  guideUrl: string;
};

export const PLATFORMS: Record<ScriptProvider, TPlatformDetails> = {
  [ScriptProvider.Modal]: {
    name: "Modal",
    logo: "Modal.svg",
    description: "The proxy runs in a sidecar next to each sandbox, so nothing else can reach it.",
    guideUrl: AGENT_VAULT_DOCS.modalGuide
  },
  [ScriptProvider.Daytona]: {
    name: "Daytona",
    logo: "Daytona.png",
    description:
      "The proxy runs in its own sandbox, and only the agent's linked sandbox can reach it.",
    guideUrl: AGENT_VAULT_DOCS.daytonaGuide
  },
  [ScriptProvider.E2B]: {
    name: "E2B",
    logo: "E2B.svg",
    description: "Each sandbox sends its traffic to one proxy you run, over SOCKS5.",
    guideUrl: AGENT_VAULT_DOCS.e2bGuide
  },
  [ScriptProvider.Docker]: {
    name: "Docker",
    logo: "Docker.png",
    description:
      "The proxy runs in a container beside each agent's container, on a network with no internet access.",
    guideUrl: AGENT_VAULT_DOCS.dockerGuide
  },
  [ScriptProvider.Kubernetes]: {
    name: "Kubernetes",
    logo: "Kubernetes.png",
    description:
      "The proxy runs in your cluster, and an orchestrator starts each agent's pod with its own session.",
    guideUrl: AGENT_VAULT_DOCS.kubernetesSetupGuide
  },
  [ScriptProvider.Cursor]: {
    name: "Cursor Cloud Agents",
    logo: "Cursor.svg",
    description:
      "Self-hosted workers in your Kubernetes cluster, where a spawn hook gives each run its own session.",
    guideUrl: AGENT_VAULT_DOCS.cursorGuide
  }
};

export const LANGUAGE_NAMES: Record<ScriptLanguage, string> = {
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

export const codeLanguageForFile = (fileName: string) => {
  if (fileName.split("/").pop()?.startsWith("Dockerfile")) return "dockerfile";
  if (fileName.endsWith(".ts")) return "typescript";
  if (fileName.endsWith(".py")) return "python";
  if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) return "yaml";
  if (fileName.endsWith(".sh")) return "bash";
  return undefined;
};

export const runCommand = (token: string, siteUrl: string) =>
  `infisical agent-vault run \\
  --session-token ${token} \\
  --proxy <proxy-host>:17323 \\
  --domain ${siteUrl} \\
  -- <agent-command>`;

export enum SnippetLanguage {
  Python = "python",
  TypeScript = "typescript",
  Cli = "cli"
}

export type SnippetValues = {
  siteUrl: string;
  projectId: string;
  accessBundle: string;
  clientId: string;
  clientSecret: string;
};

export const INSTALL_COMMANDS: Record<SnippetLanguage, string> = {
  [SnippetLanguage.Python]: "pip install 'infisicalsdk>=1.3.0'",
  [SnippetLanguage.TypeScript]: "npm install @infisical/sdk",
  [SnippetLanguage.Cli]: "npm install -g @infisical/cli"
};

export const createSessionSnippet = (language: SnippetLanguage, values: SnippetValues) => {
  const { siteUrl, projectId, accessBundle, clientId, clientSecret } = values;

  if (language === SnippetLanguage.Python) {
    return `from infisical_sdk import InfisicalSDKClient

client = InfisicalSDKClient(host="${siteUrl}")
client.auth.universal_auth.login(
    client_id="${clientId}",
    client_secret="${clientSecret}"
)

session = client.agent_vault.sessions.create(
    project_id="${projectId}",
    access_bundle="${accessBundle}",
    ttl="1h"
)

try:
    run_agent(session.token)  # Your code that starts the agent
finally:
    client.agent_vault.sessions.revoke(session_id=session.id)`;
  }

  if (language === SnippetLanguage.TypeScript) {
    return `import { InfisicalSDK } from "@infisical/sdk";

const client = new InfisicalSDK({ siteUrl: "${siteUrl}" });
await client.auth().universalAuth.login({
  clientId: "${clientId}",
  clientSecret: "${clientSecret}"
});

const session = await client.agentVault().sessions.create({
  projectId: "${projectId}",
  accessBundle: "${accessBundle}",
  ttl: "1h"
});

try {
  await runAgent(session.token); // Your code that starts the agent
} finally {
  await client.agentVault().sessions.revoke(session.id);
}`;
  }

  // The credentials go on the create command alone, so the agent that inherits this shell's
  // environment gets only the session token, never a secret it could mint more sessions with.
  return `export INFISICAL_AGENT_VAULT_SESSION_TOKEN=$( \\
  INFISICAL_UNIVERSAL_AUTH_CLIENT_ID=${clientId} \\
  INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET=${clientSecret} \\
  infisical agent-vault sessions create \\
    --domain ${siteUrl} \\
    --project-id ${projectId} \\
    --access-bundle ${accessBundle} \\
    --ttl 1h)`;
};
