import { IdentityAuthMethod } from "./enums";

export const identityAuthToNameMap: { [I in IdentityAuthMethod]: string } = {
    [IdentityAuthMethod.UNIVERSAL_AUTH]: "Universal Auth"
};