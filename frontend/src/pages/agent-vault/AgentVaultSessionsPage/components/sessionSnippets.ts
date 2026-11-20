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
