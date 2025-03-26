import { useNavigate, useSearch } from "@tanstack/react-router";

import { Button } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useVerifyPasswordResetCode } from "@app/hooks/api";
import { UserEncryptionVersion } from "@app/hooks/api/auth/types";

type Props = {
  onComplete: (verificationToken: string, encryptionVersion: UserEncryptionVersion) => void;
};

export const ConfirmEmailStep = ({ onComplete }: Props) => {
  const navigate = useNavigate();
  const search = useSearch({ from: ROUTE_PATHS.Auth.PasswordResetPage.id });
  const { token, to: email } = search;

  const {
    mutateAsync: verifyPasswordResetCodeMutateAsync,
    isPending: isVerifyPasswordResetLoading
  } = useVerifyPasswordResetCode();
  return (
    <div className="mx-1 my-32 flex w-full max-w-xs flex-col items-center rounded-xl bg-bunker px-4 py-6 drop-shadow-xl md:max-w-lg md:px-6">
      <p className="mb-8 flex justify-center bg-gradient-to-br from-sky-400 to-primary bg-clip-text text-center text-4xl font-semibold text-transparent">
        Confirm your email
      </p>
      <img
        src="/images/envelope.svg"
        style={{ height: "262px", width: "410px" }}
        alt="verify email"
      />
      <div className="mx-auto mb-2 mt-4 flex max-h-24 max-w-md flex-col items-center justify-center px-4 text-lg md:p-2">
        <Button
          onClick={async () => {
            try {
              const response = await verifyPasswordResetCodeMutateAsync({
                email,
                code: token
              });

              onComplete(response.token, response.userEncryptionVersion);
            } catch (err) {
              console.log("ERROR", err);
              navigate({ to: "/email-not-verified" });
            }
          }}
          isLoading={isVerifyPasswordResetLoading}
          size="lg"
        >
          Confirm Email
        </Button>
      </div>
    </div>
  );
};
