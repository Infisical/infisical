import { faArrowUpRightFromSquare, faWarning, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";
import { useToggle } from "@app/hooks";

type Props = {
  text: string;
  link?: string;
};

export const OrgAlertBanner = ({ text, link }: Props) => {
  const [isDismissed, setIsDismissed] = useToggle(false);

  if (isDismissed) return null;

  return (
    <div className="border-yellow/50 bg-yellow/30 flex w-full items-center border-b px-4 py-2 text-sm text-yellow-200">
      <FontAwesomeIcon icon={faWarning} className="text-yellow mr-2.5 text-base" />
      {text}{" "}
      {link && (
        <>
          Learn how to configure it
          <a
            href={link}
            rel="noopener noreferrer"
            target="_blank"
            className="group flex items-center"
          >
            <span className="group-hover:text-mineshaft-100 group-hover:decoration-mineshaft-100 cursor-pointer pl-1 underline underline-offset-2 duration-100">
              here
            </span>
            <FontAwesomeIcon
              className="group-hover:text-mineshaft-100 ml-1 mt-[0.12rem]"
              icon={faArrowUpRightFromSquare}
              size="xs"
            />
          </a>
          .
        </>
      )}
      <IconButton
        className="ml-auto p-0 text-yellow-200"
        ariaLabel="Dismiss banner"
        variant="plain"
        onClick={() => setIsDismissed.on()}
      >
        <FontAwesomeIcon icon={faXmark} />
      </IconButton>
    </div>
  );
};
