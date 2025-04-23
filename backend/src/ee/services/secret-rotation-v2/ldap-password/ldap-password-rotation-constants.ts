import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const LDAP_PASSWORD_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "LDAP Password",
  type: SecretRotation.LdapPassword,
  connection: AppConnection.LDAP,
  template: {
    secretsMapping: {
      dn: "LDAP_DN",
      password: "LDAP_PASSWORD"
    }
  }
};
