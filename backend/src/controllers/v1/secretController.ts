import { Request, Response } from "express";
import { Types } from "mongoose";
import { Key } from "../../models";
import {
  pullSecrets as pull,
  v1PushSecrets as push,
  reformatPullSecrets
} from "../../helpers/secret";
import { pushKeys } from "../../helpers/key";
import { eventPushSecrets } from "../../events";
import { EventService } from "../../services";
import { TelemetryService } from "../../services";

interface PushSecret {
  ciphertextKey: string;
  ivKey: string;
  tagKey: string;
  hashKey: string;
  ciphertextValue: string;
  ivValue: string;
  tagValue: string;
  hashValue: string;
  ciphertextComment: string;
  ivComment: string;
  tagComment: string;
  hashComment: string;
  type: "shared" | "personal";
}

/**
 * Upload (encrypted) secrets to workspace with id [workspaceId]
 * for environment [environment]
 * @param req
 * @param res
 * @returns
 */
export const pushSecrets = async (req: Request, res: Response) => {
  // upload (encrypted) secrets to workspace with id [workspaceId]
  const postHogClient = await TelemetryService.getPostHogClient();
  let { secrets }: { secrets: PushSecret[] } = req.body;
  const { keys, environment, channel } = req.body;
  const { workspaceId } = req.params;

  // validate environment
  const workspaceEnvs = req.membership.workspace.environments;
  if (!workspaceEnvs.find(({ slug }: { slug: string }) => slug === environment)) {
    throw new Error("Failed to validate environment");
  }

  // sanitize secrets
  secrets = secrets.filter((s: PushSecret) => s.ciphertextKey !== "" && s.ciphertextValue !== "");

  await push({
    userId: req.user._id,
    workspaceId,
    environment,
    secrets
  });

  await pushKeys({
    userId: req.user._id,
    workspaceId,
    keys
  });

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets pushed",
      distinctId: req.user.email,
      properties: {
        numberOfSecrets: secrets.length,
        environment,
        workspaceId,
        channel: channel ? channel : "cli"
      }
    });
  }

  // trigger event - push secrets
  EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath: "/"
    })
  });

  return res.status(200).send({
    message: "Successfully uploaded workspace secrets"
  });
};

/**
 * Return (encrypted) secrets for workspace with id [workspaceId]
 * for environment [environment] and (encrypted) workspace key
 * @param req
 * @param res
 * @returns
 */
export const pullSecrets = async (req: Request, res: Response) => {
  let secrets;

  const postHogClient = await TelemetryService.getPostHogClient();
  const environment: string = req.query.environment as string;
  const channel: string = req.query.channel as string;
  const { workspaceId } = req.params;

  // validate environment
  const workspaceEnvs = req.membership.workspace.environments;
  if (!workspaceEnvs.find(({ slug }: { slug: string }) => slug === environment)) {
    throw new Error("Failed to validate environment");
  }

  secrets = await pull({
    userId: req.user._id.toString(),
    workspaceId,
    environment,
    channel: channel ? channel : "cli",
    ipAddress: req.realIP
  });

  const key = await Key.findOne({
    workspace: workspaceId,
    receiver: req.user._id
  })
    .sort({ createdAt: -1 })
    .populate("sender", "+publicKey");

  if (channel !== "cli") {
    secrets = reformatPullSecrets({ secrets });
  }

  if (postHogClient) {
    // capture secrets pushed event in production
    postHogClient.capture({
      distinctId: req.user.email,
      event: "secrets pulled",
      properties: {
        numberOfSecrets: secrets.length,
        environment,
        workspaceId,
        channel: channel ? channel : "cli"
      }
    });
  }

  return res.status(200).send({
    secrets,
    key
  });
};

/**
 * Return (encrypted) secrets for workspace with id [workspaceId]
 * for environment [environment] and (encrypted) workspace key
 * via service token
 * @param req
 * @param res
 * @returns
 */
export const pullSecretsServiceToken = async (req: Request, res: Response) => {
  const postHogClient = await TelemetryService.getPostHogClient();
  const environment: string = req.query.environment as string;
  const channel: string = req.query.channel as string;
  const { workspaceId } = req.params;

  // validate environment
  const workspaceEnvs = req.membership.workspace.environments;
  if (!workspaceEnvs.find(({ slug }: { slug: string }) => slug === environment)) {
    throw new Error("Failed to validate environment");
  }

  const secrets = await pull({
    userId: req.serviceToken.user._id.toString(),
    workspaceId,
    environment,
    channel: "cli",
    ipAddress: req.realIP
  });

  const key = {
    encryptedKey: req.serviceToken.encryptedKey,
    nonce: req.serviceToken.nonce,
    sender: {
      publicKey: req.serviceToken.publicKey
    },
    receiver: req.serviceToken.user,
    workspace: req.serviceToken.workspace
  };

  if (postHogClient) {
    // capture secrets pulled event in production
    postHogClient.capture({
      distinctId: req.serviceToken.user.email,
      event: "secrets pulled",
      properties: {
        numberOfSecrets: secrets.length,
        environment,
        workspaceId,
        channel: channel ? channel : "cli"
      }
    });
  }

  return res.status(200).send({
    secrets: reformatPullSecrets({ secrets }),
    key
  });
};
