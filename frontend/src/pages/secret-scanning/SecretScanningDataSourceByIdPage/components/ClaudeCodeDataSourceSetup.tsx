import { Code, CodeBlock } from "@app/components/v3";
import {
  CLAUDE_CODE_PLUGIN_INSTALL_COMMAND,
  CLAUDE_CODE_PLUGIN_SETUP_COMMAND
} from "@app/helpers/secretScanningV2";

type Props = {
  dataSourceName: string;
};

export const ClaudeCodeDataSourceSetup = ({ dataSourceName }: Props) => (
  <div className="flex w-full flex-col gap-2 text-left text-xs leading-relaxed text-muted">
      <Code>infisical login</Code>, plus <Code>jq</Code> and <Code>curl</Code>. Their project role
      must allow triggering data source scans. Without these, the plugin blocks every prompt.
    </p>
    <p>1. Install the Infisical plugin for Claude Code:</p>
    <CodeBlock label="Install Command" value={CLAUDE_CODE_PLUGIN_INSTALL_COMMAND} />
    <p>
      2. In Claude Code, run <Code>{CLAUDE_CODE_PLUGIN_SETUP_COMMAND}</Code> and select{" "}
      <span className="font-medium">{dataSourceName}</span>.
    </p>
  </div>
);
