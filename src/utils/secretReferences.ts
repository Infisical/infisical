import { Secret } from '../models/Secret';

export function getSecretReferenceValue(secretName: string, secrets: Secret[]): string | undefined {
  // Split the secret name by '.' to handle nested levels
  const secretNameParts = secretName.split('.');

  // Initialize the current secret
  let currentSecret: Secret | undefined;

  // Iterate over the secret name parts to find the referenced secret
  for (const part of secretNameParts) {
    // Find the secret with the current part as its name
    currentSecret = secrets.find((secret) => secret.name === part);

    // If the secret is not found, return undefined
    if (!currentSecret) return undefined;

    // If the secret has a reference, update the current secret
    if (currentSecret.reference) {
      currentSecret = secrets.find((secret) => secret.name === currentSecret.reference);
    }
  }

  // Return the value of the referenced secret
  return currentSecret?.value;
}