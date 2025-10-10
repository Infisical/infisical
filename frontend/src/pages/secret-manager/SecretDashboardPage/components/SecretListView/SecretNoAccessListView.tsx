import { faLock, faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { FontAwesomeSymbol, Input, Tooltip } from "@app/components/v2";
import { Blur } from "@app/components/v2/Blur";

import { FontAwesomeSpriteName } from "./SecretListView.utils";

type Props = {
  count: number;
  isRotationView?: boolean;
};

export const SecretNoAccessListView = ({ count, isRotationView }: Props) => {
  return (
    <>
      {Array.from(Array(count)).map((_, i) => (
        <Tooltip
          className="max-w-sm"
          asChild
          content="You do not have permission to view this secret"
          key={`no-access-secret-${i + 1}`}
        >
          <div
            className={twMerge(
              "border-mineshaft-600 hover:bg-mineshaft-700 flex border-b shadow-none",
              isRotationView ? "bg-mineshaft-700/60" : "bg-mineshaft-800"
            )}
          >
            <div className="flex h-11 w-11 items-center justify-center px-4 py-3">
              {isRotationView ? (
                <div className="relative">
                  <FontAwesomeIcon
                    icon={faLock}
                    size="xs"
                    className={twMerge("ml-3 h-3.5 w-3.5")}
                  />
                  <FontAwesomeIcon
                    icon={faRotate}
                    size="xs"
                    className="text-mineshaft-400 absolute -bottom-[0.05rem] -right-[0.2rem]"
                  />
                </div>
              ) : (
                <FontAwesomeSymbol
                  className="ml-3 block h-3.5 w-3.5"
                  symbolName={FontAwesomeSpriteName.KeyLock}
                />
              )}
            </div>
            <div className="border-mineshaft-600 ml-[0.05rem] flex h-11 w-80 shrink-0 items-center border-r px-4 py-2">
              <Input
                autoComplete="off"
                isReadOnly
                variant="plain"
                value="NO ACCESS"
                isDisabled
                className="blur-xs focus:text-bunker-100 w-full px-0 placeholder:text-red-500 focus:ring-transparent"
              />
            </div>
            <Blur className="pl-8" />
          </div>
        </Tooltip>
      ))}
    </>
  );
};
