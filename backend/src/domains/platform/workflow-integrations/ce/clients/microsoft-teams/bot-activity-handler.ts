import { TeamsActivityHandler, TurnContext } from "botbuilder";

import { logger } from "@app/lib/logger";

const INSTALL_GREETING =
  "👋 Thanks for installing the Infisical app! You can now use the bot to send notifications to your selected teams.";

export class BotActivityHandler extends TeamsActivityHandler {
  constructor(onBotAdded: (tenantId: string) => Promise<void>) {
    super();

    // We know when a bot is added, but we can't know when it's fully removed from the tenant.
    this.onTeamsMembersAddedEvent(async (membersAdded, _, context) => {
      const botWasAdded = membersAdded.some((member) => member.id === context.activity.recipient.id);

      if (botWasAdded && context.activity.conversation.tenantId) {
        await onBotAdded(context.activity.conversation.tenantId).catch((error) => {
          logger.error(error, "Microsoft Teams Workflow Integration: Failed to handle the bot being added");
        });

        // Required for the bot to send proactive messages, which the bot release validation step checks.
        await context.sendActivity(INSTALL_GREETING);
      }
    });
  }

  async run(context: TurnContext) {
    logger.info(context, "Processing Microsoft Teams context");
    await super.run(context);
  }
}
