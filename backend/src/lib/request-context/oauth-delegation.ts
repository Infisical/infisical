import { requestContext } from "@fastify/request-context";

import { RequestContextKey } from "./request-context-keys";

/**
 * Whether the request carries a scope-narrowed delegated OAuth token.
 *
 * `inject-identity` sets `OauthScopes` for every such token, including an empty list, and leaves the
 * key unset for first-party sessions, background jobs and fully-delegated RFC 8693 tokens. Reading it
 * this way matches full delegation positively, so a token that lost its delegation marker is treated
 * as narrowed rather than promoted.
 *
 * Use it to guard a path that grants access *without* evaluating a CASL ability. Scopes are
 * intersected inside `permission-service`, so any shortcut that skips the ability check also skips
 * the narrowing, and a restricted token would act with the authorizing user's full authority.
 */
export const isScopeNarrowedRequest = () => requestContext.get(RequestContextKey.OauthScopes) !== undefined;
