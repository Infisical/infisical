import { isAxiosError } from "axios";

import { ChatPostFailure } from "../../models/enums";
import { TChatPostRefusal } from "../../services/dependencies";

export const toTeamsPostRefusal = (err: unknown): TChatPostRefusal => {
  if (!isAxiosError(err)) return { failure: ChatPostFailure.Other };
  if (!err.response) return { failure: ChatPostFailure.Unreachable };

  const { status } = err.response;
  if (status === 401 || status === 403) return { failure: ChatPostFailure.AuthRejected, providerError: String(status) };
  if (status === 404) return { failure: ChatPostFailure.ChannelNotFound, providerError: String(status) };
  if (status === 429) return { failure: ChatPostFailure.RateLimited, providerError: String(status) };
  return { failure: ChatPostFailure.Other, providerError: String(status) };
};
