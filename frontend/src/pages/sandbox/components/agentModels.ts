import { SandboxAgentType } from "@app/hooks/api/sandboxes";

export type TAgentModel = {
  id: string;
  name: string;
  hint: string;
  isRecommended?: boolean;
};

/**
 * The models offered per agent. Only Gemini's are wired to a working loop; the rest are stored on
 * the sandbox so the choice survives, and take effect if that agent is implemented.
 */
export const AGENT_MODELS: Record<SandboxAgentType, TAgentModel[]> = {
  [SandboxAgentType.Gemini]: [
    {
      id: "gemini-3.6-flash",
      name: "Gemini 3.6 Flash",
      hint: "Fast, and strong enough for shell work",
      isRecommended: true
    },
    {
      id: "gemini-3.6-pro",
      name: "Gemini 3.6 Pro",
      hint: "Slower, better at long multi-step tasks"
    },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", hint: "Previous generation" }
  ],
  [SandboxAgentType.Claude]: [
    {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      hint: "Balanced speed and depth",
      isRecommended: true
    },
    { id: "claude-opus-5", name: "Claude Opus 5", hint: "Most capable, slowest" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", hint: "Fastest, cheapest" }
  ],
  [SandboxAgentType.Codex]: [
    { id: "gpt-5.1", name: "GPT-5.1", hint: "General purpose", isRecommended: true },
    { id: "gpt-5.1-mini", name: "GPT-5.1 mini", hint: "Faster and cheaper" },
    { id: "o4-mini", name: "o4-mini", hint: "Reasoning-focused" }
  ],
  [SandboxAgentType.Copilot]: [
    {
      id: "gpt-5.1-copilot",
      name: "Copilot (GPT-5.1)",
      hint: "Default Copilot model",
      isRecommended: true
    },
    { id: "claude-sonnet-5-copilot", name: "Copilot (Claude Sonnet 5)", hint: "Anthropic backend" }
  ]
};

export const getDefaultModel = (agentType: SandboxAgentType) =>
  (AGENT_MODELS[agentType].find((model) => model.isRecommended) ?? AGENT_MODELS[agentType][0]).id;
