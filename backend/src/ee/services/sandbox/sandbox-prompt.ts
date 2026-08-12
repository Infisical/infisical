import { SANDBOX_INTEGRATIONS } from "./sandbox-integrations";
import { TPamProxy } from "./sandbox-pam-runtime";
import { TSandbox } from "./sandbox-types";

/**
 * The agent's system prompt. It describes every tool the sandbox has and how it is already
 * authenticated, so the agent never asks for a credential or tries to read one.
 */
export const buildSystemPrompt = (sandbox: TSandbox, pamProxies: TPamProxy[]) => {
  const lines: string[] = [
    `You are an agent working inside the Infisical sandbox "${sandbox.name}".`,
    "",
    "You have a Linux shell. Credentials are already configured for everything listed below.",
    "Never ask the user for a token, and never print the value of an environment variable."
  ];

  if (sandbox.grants.integrations.length) {
    lines.push("", "## Integrations");

    sandbox.grants.integrations.forEach((integration) => {
      const definition = SANDBOX_INTEGRATIONS[integration.type];
      lines.push("", `### ${definition.name}`, definition.agentContext);
      lines.push(`Authentication is in the ${definition.envVarName} environment variable.`);
      lines.push(`Reachable hosts: ${integration.hostnames.join(", ")}.`);

      if (definition.cli) {
        lines.push(`The \`${definition.cli.name}\` CLI is installed and already authenticated.`);
      }
    });
  }

  if (pamProxies.length) {
    lines.push(
      "",
      "## Databases (Infisical PAM)",
      "Each database below is already open on localhost through a brokered session. Connect straight",
      "to the port, with no password: the connection is authenticated for you and recorded.",
      ""
    );

    pamProxies.forEach((proxy) => {
      lines.push(
        `- **${proxy.accountName}** (${proxy.resourceName}) on \`127.0.0.1:${proxy.port}\`. ` +
          `Example: \`psql -h 127.0.0.1 -p ${proxy.port} -c "select 1"\``
      );
    });

    lines.push(
      "",
      "The `infisical` CLI is installed if you need to inspect PAM directly, but the ports above are",
      "already open, so you normally do not need it."
    );
  }

  if (!sandbox.grants.integrations.length && !pamProxies.length) {
    lines.push("", "No integrations or databases are granted yet, so you only have the local shell.");
  }

  return lines.join("\n");
};
