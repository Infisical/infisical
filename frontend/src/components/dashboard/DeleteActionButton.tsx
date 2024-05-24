import React from "react";
import { useTranslation } from "react-i18next";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "../basic/buttons/Button";

type Props = {
  onSubmit: () => void;
  isPlain?: boolean;
};

export const DeleteActionButton = ({ onSubmit, isPlain }: Props) => {
  const { t } = useTranslation();

  return (
    <div
      className={`${
        !isPlain
          ? "ml-2 h-[2.5rem] w-[4.5rem] rounded-md bg-[#9B3535] opacity-70 duration-200 hover:opacity-100"
          : "justfy-center mr-2 flex h-[2.35rem] w-[1.5rem] cursor-pointer items-center"
      }`}
    >
      {isPlain ? (
        <div
          onKeyDown={() => null}
          role="button"
          tabIndex={0}
          onClick={onSubmit}
          className="invisible group-hover:visible"
        >
          <FontAwesomeIcon
            className="mt-0.5 pl-2 pr-6 text-lg text-bunker-300 hover:text-red"
            icon={faXmark}
          />
        </div>
      ) : (
        <Button text={String(t("Delete"))} color="red" size="md" onButtonPressed={onSubmit} />
      )}
    </div>
  );
};
