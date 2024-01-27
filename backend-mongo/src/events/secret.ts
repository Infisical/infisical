import { Types } from "mongoose";
import { EVENT_PULL_SECRETS, EVENT_PUSH_SECRETS } from "../variables";

interface PushSecret {
  ciphertextKey: string;
  ivKey: string;
  tagKey: string;
  hashKey: string;
  ciphertextValue: string;
  ivValue: string;
  tagValue: string;
  hashValue: string;
  type: "shared" | "personal";
}

/**
 * Return event for pushing secrets
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace to push secrets to
 * @returns
 */
const eventPushSecrets = ({
  workspaceId,
  environment,
  secretPath
}: {
  workspaceId: Types.ObjectId;
  environment: string;
  secretPath: string;
}) => {
  return {
    name: EVENT_PUSH_SECRETS,
    workspaceId,
    environment,
    secretPath,
    payload: {}
  };
};

/**
 * Return event for pulling secrets
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace to pull secrets from
 * @returns
 */
const eventPullSecrets = ({ workspaceId }: { workspaceId: string }) => {
  return {
    name: EVENT_PULL_SECRETS,
    workspaceId,
    payload: {}
  };
};

export { eventPushSecrets };
