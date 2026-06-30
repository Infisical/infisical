export {
  useCreateOauthClient,
  useDeleteOauthClient,
  useOauthConsent,
  useRotateOauthClientSecret,
  useUpdateOauthClient
} from "./mutations";
export { useGetOauthAuthorizeInfo, useGetOauthClients } from "./queries";
export type { TOauthAuthorizeInfo, TOauthClient } from "./types";
