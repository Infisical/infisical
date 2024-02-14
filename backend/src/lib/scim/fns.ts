import { TScimUser } from "./types";

export const createScimUser = ({
    userId,
    firstName,
    lastName,
    email
}: {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
}): TScimUser => {
    let scimUser = {
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
        "id": userId,
        "userName": email,
        "displayName": `${firstName} ${lastName}`,
        "name": {
            "givenName": firstName,
            "middleName": null,
            "familyName": lastName
        },
        "emails":
            [{
                "primary": true,
                "value": email,
                "type": "work"
            }],
        "active": true,
        "groups": [],
        "meta": {
            "resourceType": "User",
            "location": null
        }
    };
    
    return scimUser;
}