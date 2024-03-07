import { useCallback } from "react";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button } from "@app/components/v2";
import { useToggle } from "@app/hooks";

type Props = {
  value: string;
  hoverText: string;
  children: React.ReactNode;
};

export const CopyButton = ({ value, children, hoverText }: Props) => {
  const [isProjectIdCopied, setIsProjectIdCopied] = useToggle(false);
  const { createNotification } = useNotificationContext();

  const copyToClipboard = useCallback(() => {
    if (isProjectIdCopied) {
      return;
    }

    setIsProjectIdCopied.on();
    navigator.clipboard.writeText(value);

    createNotification({
      text: "Copied Project ID to clipboard",
      type: "success"
    });

    const timer = setTimeout(() => setIsProjectIdCopied.off(), 2000);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timer);
  }, [isProjectIdCopied]);

  return (
    <Button
      colorSchema="secondary"
      className="group relative"
      leftIcon={<FontAwesomeIcon icon={isProjectIdCopied ? faCheck : faCopy} />}
      onClick={copyToClipboard}
    >
      {children}
      <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
        {hoverText}
      </span>
    </Button>
  );
};
