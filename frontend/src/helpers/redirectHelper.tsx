import { FC, ReactNode } from "react";
import { useRouter } from "next/router";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button } from "@app/components/v2";

interface RedirectButtonProps {
  text: string;
  redirectText?: string;
  path?: string;
  url?: string;
  isDisabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  isLoading?: boolean;
}

type PropsWithRequiredPathOrUrl = RedirectButtonProps & (
  { path: string; url?: never } | { path?: never; url: string }
);

export const RedirectButton: FC<PropsWithRequiredPathOrUrl> = ({
  text,
  redirectText,
  path,
  url,
  isDisabled,
  leftIcon,
  rightIcon,
  isLoading,
}) => {
  const router = useRouter();
  const { createNotification } = useNotificationContext();
  const PAGE_REDIRECT_TIMEOUT = 250;

  const isValidHttpsUrl = (input: string): boolean => {
    const httpsUrlPattern = /^https:\/\/\S+/i;
    return httpsUrlPattern.test(input);
  };

  const handleClick = () => {
    createNotification({
      text: redirectText || `Redirecting to ${path || url}...`,
      type: "info",
    });

    if (path) {
      setTimeout(() => {
        router.push(path);
      }, PAGE_REDIRECT_TIMEOUT);
    } else if (url && isValidHttpsUrl(url)) {
      window.open(url, "_blank", "noopener noreferrer");
    } else {
      createNotification({
        text: `Error redirecting to ${text}`,
        type: "error",
      });
    }
  };

  return (
    <Button 
      type="button" 
      onClick={handleClick} 
      isDisabled={isDisabled}
      isLoading={isLoading} 
      leftIcon={leftIcon} 
      rightIcon={rightIcon}
    >
      {text}
    </Button>
  );
};
