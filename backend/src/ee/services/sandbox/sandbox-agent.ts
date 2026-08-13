import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { execInSandbox } from "./sandbox-runtime";

/**
 * The agent loop. Gemini is given one tool, a shell inside the sandbox, plus a system prompt naming
 * the CLIs and databases it can reach. Everything it can touch is already brokered, so the loop
 * itself needs no credential handling.
 */

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 60_000;
const MAX_TOOL_ROUNDS = 30;

export type TAgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type TAgentToolCall = {
  command: string;
  exitCode: number | null;
  output: string;
};

export type TAgentTurn = {
  reply: string;
  toolCalls: TAgentToolCall[];
};

/** Emitted as the turn runs so the UI can show work in progress rather than a spinner. */
export type TAgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; command: string }
  | { type: "tool_end"; command: string; exitCode: number | null; output: string }
  | { type: "done"; reply: string }
  | { type: "error"; message: string };

export type TAgentEventSink = (event: TAgentEvent) => void;

type TGeminiPart = {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};

type TGeminiContent = { role: "user" | "model"; parts: TGeminiPart[] };

type TGeminiResponse = {
  candidates?: { content?: { parts?: TGeminiPart[] } }[];
};

const RUN_COMMAND_TOOL = {
  functionDeclarations: [
    {
      name: "run_command",
      description:
        "Run a shell command inside the sandbox and return its output. Use this for everything: CLIs, curl, psql, reading files.",
      parameters: {
        type: "OBJECT",
        properties: {
          command: { type: "STRING", description: "The shell command to run." }
        },
        required: ["command"]
      }
    }
  ]
};

/**
 * Streams one model call, emitting text as it arrives and returning the accumulated parts so the
 * caller can see whether the model asked for a tool.
 */
const streamGemini = async (
  apiKey: string,
  systemPrompt: string,
  contents: TGeminiContent[],
  onText: (text: string) => void
): Promise<TGeminiPart[]> => {
  const response = await request.post<NodeJS.ReadableStream>(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`,
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [RUN_COMMAND_TOOL],
      generationConfig: { temperature: 0.2 }
    },
    { params: { key: apiKey, alt: "sse" }, timeout: GEMINI_TIMEOUT_MS, responseType: "stream" }
  );

  const parts: TGeminiPart[] = [];
  let buffer = "";
  // Kept so a stream that yields no parts can say why. An error frame and an empty answer are
  // otherwise indistinguishable, and both surface as a chat window that never responds.
  let lastFrame = "";

  await new Promise<void>((resolve, reject) => {
    response.data.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");

      // SSE frames are separated by a blank line, which Google sends as CRLF. Splitting on "\n\n"
      // alone never matches, so nothing is ever parsed.
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";

      frames.forEach((frame) => {
        if (frame.trim()) lastFrame = frame;
        const line = frame.split(/\r?\n/).find((l) => l.startsWith("data:"));
        if (!line) return;

        try {
          const payload = JSON.parse(line.slice(5).trim()) as TGeminiResponse;
          (payload.candidates?.[0]?.content?.parts ?? []).forEach((part) => {
            parts.push(part);
            if (part.text) onText(part.text);
          });
        } catch {
          // a partial or non-JSON keepalive frame; the next chunk completes it
        }
      });
    });

    response.data.on("end", () => {
      // A last frame without a trailing blank line stays in the buffer, so flush it.
      const line = buffer.split(/\r?\n/).find((l) => l.startsWith("data:"));
      if (line) {
        try {
          const payload = JSON.parse(line.slice(5).trim()) as TGeminiResponse;
          (payload.candidates?.[0]?.content?.parts ?? []).forEach((part) => {
            parts.push(part);
            if (part.text) onText(part.text);
          });
        } catch {
          // incomplete trailing frame
        }
      }
      resolve();
    });
    response.data.on("error", reject);
  });

  if (!parts.length) {
    logger.error(
      { model: GEMINI_MODEL, lastFrame: lastFrame.slice(0, 500) },
      `Agent model returned nothing [model=${GEMINI_MODEL}]`
    );
    throw new BadRequestError({
      message: `The agent model '${GEMINI_MODEL}' returned no response. ${lastFrame.slice(0, 200) || "The stream was empty."}`
    });
  }

  return parts;
};

export const runAgentTurn = async ({
  sandboxId,
  apiKey,
  systemPrompt,
  messages,
  onEvent = () => {}
}: {
  sandboxId: string;
  apiKey: string;
  systemPrompt: string;
  messages: TAgentMessage[];
  onEvent?: TAgentEventSink;
}): Promise<TAgentTurn> => {
  if (!apiKey) {
    throw new BadRequestError({
      message: "This sandbox has no agent API key. Add one under the Agent section before chatting."
    });
  }

  const contents: TGeminiContent[] = messages.map((message) => ({
    role: message.role === "user" ? "user" : "model",
    parts: [{ text: message.content }]
  }));

  const toolCalls: TAgentToolCall[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    // eslint-disable-next-line no-await-in-loop -- the model decides each step from the last result
    const parts = await streamGemini(apiKey, systemPrompt, contents, (text) => onEvent({ type: "text", text }));
    const calls = parts.filter((part) => part.functionCall);

    if (!calls.length) {
      const reply = parts
        .map((part) => part.text)
        .filter(Boolean)
        .join("")
        .trim();

      onEvent({ type: "done", reply: reply || "(no response)" });
      return { reply: reply || "(no response)", toolCalls };
    }

    contents.push({ role: "model", parts });

    const responseParts: TGeminiPart[] = [];
    for (const part of calls) {
      const command = String(part.functionCall?.args?.command ?? "");
      onEvent({ type: "tool_start", command });

      // eslint-disable-next-line no-await-in-loop
      const result = await execInSandbox(sandboxId, command).catch((error: Error) => ({
        stdout: "",
        stderr: error.message,
        exitCode: null as number | null
      }));

      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(0, 8000);
      toolCalls.push({ command, exitCode: result.exitCode, output });
      onEvent({ type: "tool_end", command, exitCode: result.exitCode, output });

      responseParts.push({
        functionResponse: {
          name: "run_command",
          response: { exitCode: result.exitCode, output: output || "(no output)" }
        }
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  logger.warn(`Agent hit the tool round limit [sandboxId=${sandboxId}]`);
  const reply = "I ran out of steps before finishing that. Try narrowing the request.";
  onEvent({ type: "done", reply });
  return { reply, toolCalls };
};
