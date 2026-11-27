/* eslint-disable class-methods-use-this */
import { RuleViolationError } from "@app/domains/lib/errors";

import { TBotRequest, TMicrosoftTeamsBot } from "../services/dependencies";

export class FakeMicrosoftTeamsBot implements TMicrosoftTeamsBot {
  readonly initializations: { appId: string; clientSecret: string }[] = [];

  private initialized = false;

  private lastOnBotAdded: ((tenantId: string) => Promise<void>) | null = null;

  initialize = (input: { appId: string; clientSecret: string }) => {
    this.initializations.push(input);
    this.initialized = true;
  };

  isInitialized = () => this.initialized;

  // A body with a `tenantId` acts as the bot being added to that tenant.
  process = async (request: TBotRequest, onBotAdded: (tenantId: string) => Promise<void>) => {
    if (!this.initialized) {
      throw new RuleViolationError({
        message: "Unable to handle message endpoint because the Microsoft Teams bot is uninitialized"
      });
    }
    this.lastOnBotAdded = onBotAdded;
    if (typeof request.body.tenantId === "string") {
      await onBotAdded(request.body.tenantId).catch(() => {});
    }
  };

  addBotToTenant = async (tenantId: string) => {
    if (!this.lastOnBotAdded) throw new Error("No request was processed yet, so there is no onBotAdded to call");
    await this.lastOnBotAdded(tenantId);
  };
}
