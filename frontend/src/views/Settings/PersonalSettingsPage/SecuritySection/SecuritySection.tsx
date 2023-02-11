import { Checkbox } from '@app/components/v2';

type Props = {
  isTwoFAEnabled?: boolean;
  onIsTwoFAEnabledChange: (state: boolean) => void;
};

export const SecuritySection = ({
  isTwoFAEnabled,
  onIsTwoFAEnabledChange
}: Props) => {
  return (
    <form>
      <div className="mb-6 mt-4 flex w-full flex-col items-start rounded-md bg-white/5 px-6 pb-6 pt-2">
        <p className="mb-4 mt-2 text-xl font-semibold">
          Two-factor Authentication
        </p>
        <Checkbox
          className="data-[state=checked]:bg-primary"
          id="isTwoFAEnabled"
          isChecked={isTwoFAEnabled}
          onCheckedChange={(state) => {
            onIsTwoFAEnabledChange(state as boolean);
          }}
        >
          Enable 2-factor authentication via your personal email.
        </Checkbox>
      </div>
    </form>
  );
};
