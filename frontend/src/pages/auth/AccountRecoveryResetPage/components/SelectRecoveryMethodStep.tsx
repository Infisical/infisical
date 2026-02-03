import { ChevronRight, Info, KeyRound } from "lucide-react";
import { twMerge } from "tailwind-merge";

export enum RecoveryMethod {
  ChangePassword = "change-password",
  DomainOrSSOChange = "domain-or-sso-change"
}

type Props = {
  email: string;
  onSelect: (method: RecoveryMethod) => void;
  hasEmailAuthEnabled?: boolean;
};

export const SelectRecoveryMethodStep = ({ email, onSelect, hasEmailAuthEnabled }: Props) => {
  const recoveryMethods = [
    {
      method: RecoveryMethod.ChangePassword,
      label: "Change your password",
      description: "Reset your password if you've forgotten it or want to update it for security.",
      info: "Use this if you normally sign in with email and password",
      onSelect: () => onSelect(RecoveryMethod.ChangePassword),
      isDisabled: !hasEmailAuthEnabled,
      disabledReason: "You need to have email sign-in enabled to use this recovery method."
    },
    {
      method: RecoveryMethod.DomainOrSSOChange,
      label: "Domain or SSO change",
      description:
        "Lost access to your Google/SSO account due to a company domain change? Enable email sign-in to regain access.",
      info: "Use this if you only signed in with Google and can no longer access that Google account",
      onSelect: () => onSelect(RecoveryMethod.DomainOrSSOChange),
      isDisabled: hasEmailAuthEnabled,
      disabledReason: "You already have email sign-in enabled."
    }
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center">
      <h1 className="mb-2 bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-2xl font-medium text-transparent">
        Account Recovery
      </h1>
      <p className="mb-4 text-center text-sm text-gray-300">
        Email verified successfully for <span className="font-medium text-white">{email}</span>
      </p>
      <p className="mb-8 text-center text-sm text-gray-500">
        Select how you&apos;d like to recover access to your account
      </p>
      <div className="flex w-full flex-col gap-4">
        {recoveryMethods.map((recoveryMethod) => (
          <button
            key={recoveryMethod.method}
            type="button"
            onClick={recoveryMethod.onSelect}
            disabled={recoveryMethod.isDisabled}
            className={twMerge(
              "group w-full rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4 text-left transition-colors hover:border-mineshaft-500 hover:bg-mineshaft-700",
              recoveryMethod.isDisabled && "cursor-not-allowed"
            )}
          >
            <div
              className={twMerge(
                "flex items-start gap-4",
                recoveryMethod.isDisabled && "opacity-50"
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mineshaft-700 group-hover:bg-mineshaft-600">
                <KeyRound className="text-lg text-mineshaft-300" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-200">{recoveryMethod.label}</span>
                </div>
                <p className="mt-1 text-sm text-gray-400">{recoveryMethod.description}</p>
                <p className="mt-2 text-xs text-gray-500">{recoveryMethod.info}</p>
              </div>
              <ChevronRight className="mt-3 text-gray-500 transition-transform group-hover:translate-x-1" />
            </div>
            {recoveryMethod.isDisabled && recoveryMethod.disabledReason && (
              <div className="mt-4 flex items-start gap-2 rounded-md bg-muted p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-background" />
                <p className="text-xs text-background">{recoveryMethod.disabledReason}</p>
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="mt-6 w-full rounded-lg border border-mineshaft-600 bg-mineshaft-800/50 p-4">
        <p className="font-medium text-gray-300">Not sure which to choose?</p>
        <p className="mt-2 text-sm text-gray-500">
          If your company changed email domains (e.g., from @oldcompany.com to @newcompany.com) and
          you used Google sign-in, select{" "}
          <span className="font-medium text-gray-300">&quot;Domain or SSO change&quot;</span>. This
          will let you set up a password so you can sign in with your new email.
        </p>
      </div>
    </div>
  );
};
