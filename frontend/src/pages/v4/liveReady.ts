import { resolveV4Href, v4ReadinessOf } from "@app/helpers/v4Bridge";

export const isLiveReady = (pathname: string) => v4ReadinessOf(pathname) !== "none";

export const liveHref = resolveV4Href;
