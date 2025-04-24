import crypto from "crypto";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { faMinus, faPlus, faShuffle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, Input } from "@app/components/v2";

type Props = {
  onGenerate: (val: string) => void;
};

export const GenRandomNumber = ({ onGenerate }: Props) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(32);

  const onGenerateRandomHex = () => {
    const rand = crypto.randomBytes(value).toString("hex");
    onGenerate(rand);
  };

  return (
    <div className="flex">
      <Button
        className="rounded-r-none"
        colorSchema="secondary"
        leftIcon={<FontAwesomeIcon icon={faShuffle} />}
        onClick={onGenerateRandomHex}
      >
        {t("dashboard.sidebar.generate-random-hex")}
      </Button>
      <div className="rounded-r-md bg-mineshaft p-2">
        <div className="flex rounded-md border-mineshaft-400 bg-bunker-800 p-1 px-2">
          <button type="button" onClick={() => setValue((val) => val - 1)}>
            <FontAwesomeIcon icon={faMinus} size="xs" />
          </button>
          <Input
            size="sm"
            className="w-8 p-0 text-center"
            value={value}
            variant="plain"
            onChange={(e) => setValue(parseInt(e.target.value, 10))}
          />
          <button type="button" onClick={() => setValue((val) => val + 1)}>
            <FontAwesomeIcon icon={faPlus} size="xs" />
          </button>
        </div>
      </div>
    </div>
  );
};
