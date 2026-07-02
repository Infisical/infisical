export type TUserActivationServiceFactory = ReturnType<typeof userActivationServiceFactory>;

export const userActivationServiceFactory = () => {
  const getSecretsActivationStatus = async (userId: string, orgId: string) => {
    return { userId, orgId };
  };

  return {
    getSecretsActivationStatus
  };
};
