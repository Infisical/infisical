import { useNavigate, useSearch } from "@tanstack/react-router";

import { Button } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useVerifyAccountRecoveryEmail } from "@app/hooks/api";
import { UserEncryptionVersion } from "@app/hooks/api/auth/types";
import { AuthMethod } from "@app/hooks/api/users/types";

type Props = {
  onComplete: (
    verificationToken: string,
    encryptionVersion: UserEncryptionVersion,
    hasEmailAuth: boolean
  ) => void;
};

export const ConfirmEmailStep = ({ onComplete }: Props) => {
  const navigate = useNavigate();
  const search = useSearch({ from: ROUTE_PATHS.Auth.AccountRecoveryResetPage.id });
  const { token, to: email } = search;

  const {
    mutateAsync: verifyPasswordResetCodeMutateAsync,
    isPending: isVerifyPasswordResetLoading
  } = useVerifyAccountRecoveryEmail();
  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <h1 className="mb-2 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
        Confirm your email
      </h1>
      <p className="mb-8 w-max justify-center text-center text-sm text-gray-400">
        Recover account for <span className="italic">{email}</span>.
      </p>
      <div className="w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
        <Button
          type="submit"
          size="sm"
          isFullWidth
          className="h-10"
          colorSchema="primary"
          variant="solid"
          onClick={async () => {
            try {
              const response = await verifyPasswordResetCodeMutateAsync({
                email,
                code: token
              });

              onComplete(
                response.token,
                response.userEncryptionVersion,
                response.user.authMethods.includes(AuthMethod.EMAIL)
              );
            } catch (err) {
              console.log("ERROR", err);
              navigate({ to: "/email-not-verified" });
            }
          }}
          isLoading={isVerifyPasswordResetLoading}
        >
          Confirm Email
        </Button>
      </div>
    </div>
  );
};
