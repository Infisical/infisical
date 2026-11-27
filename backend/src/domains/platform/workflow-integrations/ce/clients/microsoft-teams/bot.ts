/* eslint-disable class-methods-use-this */
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationServiceClientCredentialFactory,
  Request,
  Response
} from "botbuilder";

import { RuleViolationError } from "@app/domains/lib/errors";
import { logger } from "@app/lib/logger";

import { TBotRequest, TMicrosoftTeamsBot } from "../../services/dependencies";
import { BotActivityHandler } from "./bot-activity-handler";

export class MicrosoftTeamsBot implements TMicrosoftTeamsBot {
  private adapter: CloudAdapter | null = null;

  initialize(input: { appId: string; clientSecret: string }) {
    logger.info("Initializing Microsoft Teams bot");
    this.adapter = new CloudAdapter(
      new ConfigurationBotFrameworkAuthentication(
        {},
        new ConfigurationServiceClientCredentialFactory({
          MicrosoftAppId: input.appId,
          MicrosoftAppPassword: input.clientSecret,
          MicrosoftAppType: "MultiTenant"
        })
      )
    );
  }

  isInitialized() {
    return this.adapter !== null;
  }

  async process(request: TBotRequest, onBotAdded: (tenantId: string) => Promise<void>) {
    if (!this.adapter) {
      throw new RuleViolationError({
        message: "Unable to handle message endpoint because the Microsoft Teams bot is uninitialized"
      });
    }

    const res = request.response;

    // The adapter expects a Response object, so we build one over the raw ServerResponse.
    const response: Response = {
      socket: res.socket,

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      end(...args: any[]): unknown {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        res.end(...args);
        return this;
      },

      header(name: string, value: unknown): unknown {
        res.setHeader(name, value as string);
        return this;
      },

      send(...args: unknown[]): unknown {
        if (args.length > 0) {
          const body = args[0];

          if (typeof body === "string" || Buffer.isBuffer(body)) {
            res.write(body);
          } else if (body !== null && body !== undefined) {
            const json = JSON.stringify(body);
            if (!res.headersSent && !res.getHeader("content-type")) {
              res.setHeader("content-type", "application/json");
            }
            res.write(json);
          }
        }

        const lastArg = args[args.length - 1];
        if (typeof lastArg === "function") {
          (lastArg as () => void)();
        }

        return this;
      },

      status(code: number): unknown {
        res.statusCode = code;
        return this;
      }
    };

    const botRequest: Request = { body: request.body, headers: request.headers, method: request.method };

    const handler = new BotActivityHandler(onBotAdded);
    await this.adapter.process(botRequest, response, async (context) => {
      await handler.run(context);
    });
  }
}
