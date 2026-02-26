import "dotenv/config";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface SkillCall {
  skillId: string;
  parameters: Record<string, unknown>;
  reasoning: string;
}

export interface AgentMessageCall {
  targetAgent: string;
  messageType: string;
  content: Record<string, unknown>;
  reasoning: string;
}

export interface LLMDecision {
  action: "call_skill" | "message_agent" | "complete";
  skillCall?: SkillCall;
  agentMessage?: AgentMessageCall;
  finalResponse?: string;
  reasoning: string;
}

export async function getNextAction(
  systemPrompt: string,
  conversationHistory: ChatCompletionMessageParam[],
): Promise<LLMDecision> {
  const response = await openai.chat.completions.create({
    model: "o4-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from LLM");
  }

  return JSON.parse(content) as LLMDecision;
}

export async function composeEmail(
  customerName: string,
  issueDescription: string,
  resolution: {
    refundAmount?: number;
    trackingNumber?: string;
    reshipment?: boolean;
    additionalNotes?: string;
  },
): Promise<{ subject: string; body: string }> {
  const response = await openai.chat.completions.create({
    model: "o4-mini",
    messages: [
      {
        role: "system",
        content: `You are a professional customer support agent composing email responses.
Write clear, empathetic, and helpful emails. Be concise but thorough.
Return a JSON object with "subject" and "body" fields.`,
      },
      {
        role: "user",
        content: `Compose an email response for:
Customer: ${customerName}
Original Issue: ${issueDescription}
Resolution:
- Refund Amount: ${resolution.refundAmount ? `$${resolution.refundAmount}` : "None"}
- Reshipment: ${resolution.reshipment ? "Yes" : "No"}
- Tracking Number: ${resolution.trackingNumber || "N/A"}
- Additional Notes: ${resolution.additionalNotes || "None"}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from LLM");
  }

  return JSON.parse(content) as { subject: string; body: string };
}
