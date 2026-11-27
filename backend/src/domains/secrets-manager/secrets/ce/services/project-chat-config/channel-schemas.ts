import { z } from "zod";

import { RuleViolationError } from "@app/domains/lib/errors";

import { MicrosoftTeamsProjectChatConfig } from "../../models/microsoft-teams-project-chat-config";
import { SlackProjectChatConfig } from "../../models/slack-project-chat-config";

// For the project routers' request and response schemas: the same trimming and limits the models apply, so a request
// the route accepts is one the models accept.
const refusalAsIssue = <T>(sanitize: () => T, ctx: z.RefinementCtx): T => {
  try {
    return sanitize();
  } catch (error) {
    if (!(error instanceof RuleViolationError)) throw error;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error.message });
    return z.NEVER;
  }
};

export const slackChannelsSchema = z
  .string()
  .trim()
  .default("")
  .transform((channels, ctx) => refusalAsIssue(() => SlackProjectChatConfig.sanitizeChannels(channels), ctx));

export const microsoftTeamsChannelsSchema = z
  .object({
    teamId: z.string(),
    channelIds: z.array(z.string()).min(1)
  })
  .optional()
  .transform((channels, ctx) => refusalAsIssue(() => MicrosoftTeamsProjectChatConfig.sanitizeChannels(channels), ctx));
