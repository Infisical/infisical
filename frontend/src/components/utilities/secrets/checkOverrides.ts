import { SecretDataProps } from "public/data/frequentInterfaces";

/**
 * This function downloads the secrets as a .env file
 * @param {object} obj
 * @param {SecretDataProps[]} obj.data - secrets that we want to check for overrides
 * @returns
 */
const checkOverrides = async ({ data }: { data: SecretDataProps[] }) => {
  let secrets: SecretDataProps[] = data!.map((secret) => Object.create(secret));
  const overridenSecrets = data!.filter((secret) =>
    secret.valueOverride === undefined || secret?.value !== secret?.valueOverride
      ? "shared"
      : "personal"
  );
  if (overridenSecrets.length) {
    overridenSecrets.forEach((secret) => {
      const index = secrets!.findIndex(
        (_secret) =>
          _secret.key === secret.key &&
          (secret.valueOverride === undefined || secret?.value !== secret?.valueOverride)
      );
      secrets![index].value = secret.value;
    });
    secrets = secrets!.filter(
      (secret) => secret.valueOverride === undefined || secret?.value !== secret?.valueOverride
    );
  }
  return secrets;
};

export default checkOverrides;
