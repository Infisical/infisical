import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { twMerge } from "tailwind-merge";

import { useGetUserTotpRegistration } from "@app/hooks/api";
import { useVerifyUserTotpRegistration } from "@app/hooks/api/users/mutation";

import { createNotification } from "../notifications";
import { Button, ContentLoader, Input } from "../v2";

type Props = {
  onComplete?: () => Promise<void>;
  shouldCenterQr?: boolean;
};

const TotpRegistration = ({ onComplete, shouldCenterQr }: Props) => {
  const { data: registration, isLoading } = useGetUserTotpRegistration();
  const { mutateAsync: verifyUserTotp, isLoading: isVerifyLoading } =
    useVerifyUserTotpRegistration();
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [totp, setTotp] = useState("");

  const handleTotpVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await verifyUserTotp({
      totp
    });

    createNotification({
      text: "Successfully configured mobile authenticator",
      type: "success"
    });

    if (onComplete) {
      onComplete();
    }
  };

  useEffect(() => {
    const generateQRCode = async () => {
      if (registration?.otpUrl) {
        const url = await QRCode.toDataURL(registration.otpUrl);
        setQrCodeUrl(url);
      }
    };

    generateQRCode();
  }, [registration]);

  if (isLoading) {
    return <ContentLoader />;
  }

  return (
    <div className="flex max-w-lg flex-col text-bunker-200">
      <div className="mb-8">
        1. Download a two-step verification app (Duo, Google Authenticator, etc.) and scan the QR
        code.
      </div>
      <div className={twMerge("mb-8 flex items-center", shouldCenterQr && "justify-center")}>
        <img src={qrCodeUrl} alt="registration-qr" />
      </div>
      <form onSubmit={handleTotpVerify}>
        <div className="mb-4">2. Enter the resulting verification code</div>
        <div className="mb-4 flex flex-row gap-2">
          <Input
            onChange={(e) => setTotp(e.target.value)}
            value={totp}
            placeholder="Verification code"
          />
          <Button isLoading={isVerifyLoading} type="submit">
            Enable MFA
          </Button>
        </div>
      </form>
    </div>
  );
};

export default TotpRegistration;
