import { useCallback } from "react";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
import { useToggle } from "@app/hooks";

type Props = {
  value: string;
  hoverText: string;
  notificationText: string;
  children: React.ReactNode;
};

export const CopyButton = ({ value, children, hoverText, notificationText }: Props) => {
  const [isProjectIdCopied, setIsProjectIdCopied] = useToggle(false);

  const copyToClipboard = useCallback(() => {
    if (isProjectIdCopied) {
      return;
    }

    setIsProjectIdCopied.on();
    navigator.clipboard.writeText(value);

    createNotification({
      text: notificationText,
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
      <span className="absolute -left-8 -top-20 hidden translate-y-full justify-center rounded-md bg-bunker-800 px-3 py-2 text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
        {hoverText}
      </span>
    </Button>
  );
};
