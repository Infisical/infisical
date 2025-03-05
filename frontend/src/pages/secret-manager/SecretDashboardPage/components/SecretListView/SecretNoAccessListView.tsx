import { FontAwesomeSymbol, Input, Tooltip } from "@app/components/v2";
import { Blur } from "@app/components/v2/Blur";

import { FontAwesomeSpriteName } from "./SecretListView.utils";

type Props = {
  count: number;
};

export const SecretNoAccessListView = ({ count }: Props) => {
  return (
    <>
      {Array.from(Array(count)).map((_, i) => (
        <Tooltip
          className="max-w-sm"
          asChild
          content="You do not have permission to view this secret"
          key={`no-access-secret-${i + 1}`}
        >
          <div className="flex border-b border-mineshaft-600 bg-mineshaft-800 shadow-none hover:bg-mineshaft-700">
            <div className="flex h-11 w-11 items-center justify-center px-4 py-3">
              <FontAwesomeSymbol
                className="ml-3 block h-3.5 w-3.5"
                symbolName={FontAwesomeSpriteName.KeyLock}
              />
            </div>

            <div className="flex h-11 w-80 flex-shrink-0 items-center px-4 py-2">
              <Input
                autoComplete="off"
                isReadOnly
                variant="plain"
                value="NO ACCESS"
                isDisabled
                className="w-full px-0 blur-sm placeholder:text-red-500 focus:text-bunker-100 focus:ring-transparent"
              />
            </div>
            <Blur />
          </div>
        </Tooltip>
      ))}
    </>
  );
};
