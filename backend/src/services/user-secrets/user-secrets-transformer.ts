import { decryptFields } from "./user-secrets.helpers";
import { CredentialTypes, GetSecretReturnType } from "./user-secrets-types";

const getFormatedDate = (createdAt: Date) => {
  const date = new Date(createdAt);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} - ${hours}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
};

const transformToWebLoginFields = (field: Record<string, string>, createdAt: Date) => {
  return {
    username: field.username ?? "",
    password: field.password ?? "",
    url: field.url ?? "",
    createdAt: getFormatedDate(createdAt)
  };
};

const getTransformedField = (field: Record<string, string>, createdAt: Date, credentialType: string) => {
  switch (credentialType) {
    case CredentialTypes.WebLogin:
      return transformToWebLoginFields(field, createdAt);
    default:
      return null;
  }
};

export const transformToWebLoginSecretApiResponse = (secrets: GetSecretReturnType[]) => {
  return secrets.map((secret) => {
    const decryptedFields = decryptFields(secret.fields, secret.iv, secret.tag);
    return {
      id: secret.id,
      title: secret.title,
      fields: getTransformedField(decryptedFields, secret.createdAt, secret.credentialType)
    };
  });
};
