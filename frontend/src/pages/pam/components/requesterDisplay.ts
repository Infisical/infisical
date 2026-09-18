import { TPamAccessRequest } from "@app/hooks/api/pam/types";

type RequesterFields = Pick<
  TPamAccessRequest,
  "machineIdentityId" | "requesterId" | "requesterEmail"
>;

// `machineIdentityId` is SET NULL when the identity is deleted, so a machine-raised request ends up
// with neither actor link and an empty email. Treat that shape as a machine too, rather than
// rendering a blank line where a human's email would be.
export const isMachineIdentityRequest = (request: RequesterFields) =>
  Boolean(request.machineIdentityId) || (!request.requesterId && !request.requesterEmail);

export const getRequesterSubtitle = (request: RequesterFields) =>
  isMachineIdentityRequest(request) ? "Machine Identity" : request.requesterEmail;
