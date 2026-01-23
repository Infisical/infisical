import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const LdapGroupMapsSchema: z.ZodObject<{
    id: z.ZodString;
    ldapConfigId: z.ZodString;
    ldapGroupCN: z.ZodString;
    groupId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    groupId: string;
    ldapConfigId: string;
    ldapGroupCN: string;
}, {
    id: string;
    groupId: string;
    ldapConfigId: string;
    ldapGroupCN: string;
}>;
export type TLdapGroupMaps = z.infer<typeof LdapGroupMapsSchema>;
export type TLdapGroupMapsInsert = Omit<z.input<typeof LdapGroupMapsSchema>, TImmutableDBKeys>;
export type TLdapGroupMapsUpdate = Partial<Omit<z.input<typeof LdapGroupMapsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ldap-group-maps.d.ts.map