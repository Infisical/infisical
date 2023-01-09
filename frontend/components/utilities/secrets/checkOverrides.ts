interface SecretDataProps {
  type: 'personal' | 'shared';
  pos: number;
  key: string;
  value: string;
  id: string;
  comment: string;
}

/**
 * This function downloads the secrets as a .env file
 * @param {object} obj 
 * @param {SecretDataProps[]} obj.data - secrets that we want to check for overrides
 * @returns 
 */
const checkOverrides = async ({ data }: { data: SecretDataProps[]; }) => {
  let secrets : SecretDataProps[] = data!.map((secret) => Object.create(secret));
  const overridenSecrets = data!.filter(
    (secret) => secret.type === 'personal'
  );
  if (overridenSecrets.length) {
    overridenSecrets.forEach((secret) => {
      const index = secrets!.findIndex(
        (_secret) => _secret.key === secret.key && _secret.type === 'shared'
      );
      secrets![index].value = secret.value;
    });
    secrets = secrets!.filter((secret) => secret.type === 'shared');
  }
  return secrets;
}

export default checkOverrides;
