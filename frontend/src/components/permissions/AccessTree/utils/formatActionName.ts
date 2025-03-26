import { camelCaseToSpaces } from "@app/lib/fn/string";

export const formatActionName = (action: string) => camelCaseToSpaces(action.replaceAll("-", " "));
