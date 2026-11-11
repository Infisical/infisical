// The scripts are copied verbatim from the provider guides in
// docs/documentation/platform/agent-vault/guides/, which are tested end to end. Update them
// together, or the sheet hands out code the guide no longer recommends.
import cursorControllerManifest from "./sandbox-scripts/cursor-controller.yaml.txt?raw";
import cursorControllerDockerfile from "./sandbox-scripts/cursor-controller-dockerfile.txt?raw";
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
