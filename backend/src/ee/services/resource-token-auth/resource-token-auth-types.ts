import { OrgServiceActor } from "@app/lib/types";

import { ResourceRef } from "../resource-auth-method-fns";

export type TAttachResourceTokenAuthDTO = {
  resource: ResourceRef;
  actor: OrgServiceActor;
};

export type TGetResourceTokenAuthDTO = {
  resource: ResourceRef;
  actor: OrgServiceActor;
};

export type TRevokeResourceTokenAuthDTO = TGetResourceTokenAuthDTO;

export type TGenerateResourceEnrollmentTokenDTO = TGetResourceTokenAuthDTO;

export type TEnrollWithTokenDTO = {
  token: string;
};
