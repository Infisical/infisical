export const userCredentialsKeys = {
  allCredentials: () => ["userCredentials"] as const,
  specificCredential: ({ id }: { id: string }) => [
    ...userCredentialsKeys.allCredentials(),
    { id }
  ] as const
};