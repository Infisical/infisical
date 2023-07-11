import { Types } from "mongoose";
import { EVENT_START_INTEGRATION } from "../variables";

/*
 * Return event for starting integrations
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace to push secrets to
 * @returns
 */
export const eventStartIntegration = ({
  workspaceId,
  environment
}: {
  workspaceId: Types.ObjectId;
  environment: string;
}) => {
  return {
    name: EVENT_START_INTEGRATION,
    workspaceId,
    environment,
    payload: {}
  };
};
