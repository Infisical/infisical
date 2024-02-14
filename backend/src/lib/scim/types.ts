
export type TScimUser = {
    schemas: string[];
    id: string;
    userName: string;
    displayName: string;
    name: {
        givenName: string;
        middleName: null;
        familyName: string;
    };
    emails: {
        primary: boolean;
        value: string;
        type: string;
    }[];
    active: boolean;
    groups: string[];
    meta: {
        resourceType: string;
        location: null;
    };
}