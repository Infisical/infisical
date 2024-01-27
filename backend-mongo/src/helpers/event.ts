import { Types } from "mongoose";
import { Bot } from "../models";
import { EVENT_PUSH_SECRETS, EVENT_START_INTEGRATION } from "../variables";
import { IntegrationService } from "../services";
import { triggerWebhook } from "../services/WebhookService";

interface Event {
  name: string;
  workspaceId: Types.ObjectId;
  environment?: string;
  secretPath?: string;
  payload: any;
}

/**
 * Handle event [event]
 * @param {Object} obj
 * @param {Event} obj.event - an event
 * @param {String} obj.event.name - name of event
 * @param {String} obj.event.workspaceId - id of workspace that event is part of
 * @param {Object} obj.event.payload - payload of event (depends on event)
 */
export const handleEventHelper = async ({ event }: { event: Event }) => {
  const { workspaceId, environment, secretPath } = event;

  // TODO: moduralize bot check into separate function
  const bot = await Bot.findOne({
    workspace: workspaceId,
    isActive: true
  });

  switch (event.name) {
    case EVENT_PUSH_SECRETS:
      if (bot) {
        IntegrationService.syncIntegrations({
          workspaceId,
          environment
        });
      }
      triggerWebhook(workspaceId.toString(), environment || "", secretPath || "");
      break;
    case EVENT_START_INTEGRATION:
      if (bot) {
        IntegrationService.syncIntegrations({
          workspaceId,
          environment
        });
      }
      break;
  }
};
