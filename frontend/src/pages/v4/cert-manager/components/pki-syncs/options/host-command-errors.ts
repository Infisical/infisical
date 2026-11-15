import { failed } from "../../../../access/toast";

export const notifyUnhandledHostCommandError = (error: unknown, title: string) =>
  failed(title, error);
