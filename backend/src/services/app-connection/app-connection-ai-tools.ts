import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { BadRequestError } from "@app/lib/errors";
import { TAiTool, TAiToolDeps, TAppConnectionAiTool } from "@app/services/ai/ai-types";

import { AppConnection } from "./app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "./app-connection-maps";
import { TAppConnection } from "./app-connection-types";
import { JIRA_AI_TOOLS } from "./jira/jira-ai-tools";

// Apps listed here can be added as context to any AI feature
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const APP_CONNECTION_AI_TOOLS: Partial<Record<AppConnection, Record<string, TAppConnectionAiTool<any, any>>>> = {
  [AppConnection.Jira]: JIRA_AI_TOOLS
};

export const AI_CONTEXT_APPS = Object.keys(APP_CONNECTION_AI_TOOLS) as AppConnection[];

export const listAppConnectionAiTools = (app: string) =>
  Object.entries(APP_CONNECTION_AI_TOOLS[app as AppConnection] ?? {}).map(([name, tool]) => ({
    name,
    description: tool.description
  }));

const toInputSchema = (schema: z.AnyZodObject) => {
  const jsonSchema = zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" }) as Record<
    string,
    unknown
  >;
  delete jsonSchema.$schema;
  return jsonSchema;
};

export const buildAppConnectionAiTools = (
  connections: TAppConnection[],
  deps: Omit<TAiToolDeps, "signal">
): TAiTool[] => {
  const countByApp = new Map<string, number>();

  return connections.flatMap((connection) => {
    const tools = APP_CONNECTION_AI_TOOLS[connection.app] as
      | Record<string, TAppConnectionAiTool<TAppConnection>>
      | undefined;
    if (!tools) return [];

    const count = (countByApp.get(connection.app) ?? 0) + 1;
    countByApp.set(connection.app, count);
    const prefix = count === 1 ? connection.app : `${connection.app}${count}`;
    const appName = APP_CONNECTION_NAME_MAP[connection.app];

    return Object.entries(tools).map(([toolName, tool]) => ({
      name: `${prefix}_${toolName}`,
      description: `${tool.description} Reads from the ${appName} connection '${connection.name}'.`,
      inputSchema: toInputSchema(tool.inputSchema),
      connectionId: connection.id,
      connectionName: connection.name,
      run: async (input: unknown, signal?: AbortSignal) => {
        const parsed = tool.inputSchema.safeParse(input);
        if (!parsed.success) {
          throw new BadRequestError({
            message: `Invalid input: ${parsed.error.issues.map((issue: z.ZodIssue) => issue.message).join("; ")}`
          });
        }
        return tool.run(connection, parsed.data, { ...deps, signal });
      }
    }));
  });
};
