import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const MONGODB_CREDENTIALS_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "MongoDB Credentials",
  type: SecretRotation.MongoDBCredentials,
  connection: AppConnection.MongoDB,
  template: {
    createUserStatement: `use [DATABASE_NAME]
db.createUser({
  user: "infisical_user_1",
  pwd: "temporary_password",
  roles: [{ role: "readWrite", db: "[DATABASE_NAME]" }]
})

db.createUser({
  user: "infisical_user_2",
  pwd: "temporary_password",
  roles: [{ role: "readWrite", db: "[DATABASE_NAME]" }]
})`,
    secretsMapping: {
      username: "MONGODB_DB_USERNAME",
      password: "MONGODB_DB_PASSWORD"
    }
  }
};
