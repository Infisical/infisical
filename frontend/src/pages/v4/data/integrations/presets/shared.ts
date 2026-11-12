import { getAppConnectionMethodDetails } from "@app/helpers/appConnections";

export const methodLabel = (method: Parameters<typeof getAppConnectionMethodDetails>[0]) =>
  getAppConnectionMethodDetails(method).name;
