import { useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, X } from "lucide-react";
import { z } from "zod";

import {
  Button,
  FieldError,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  TextArea,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import { isInfisicalCloud } from "@app/helpers/platform";
import { initProjectHelper } from "@app/helpers/project";
import { useCompleteAccountSignup } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";

import { checkIsPasswordBreached } from "../utilities/checks/password/checkIsPasswordBreached";
import {
  escapeCharRegex,
  letterCharRegex,
  lowEntropyRegexes,
  numAndSpecialCharRegex,
  repeatedCharRegex
} from "../utilities/checks/password/passwordRegexes";
import SecurityClient from "../utilities/SecurityClient";

const passwordSchema = z
  .string()
  .min(1, "Password is required")
  .min(14, "at least 14 characters")
  .max(100, "at most 100 characters")
  .regex(letterCharRegex, "at least 1 letter character")
  .regex(numAndSpecialCharRegex, "at least 1 number or special character")
  .refine((pwd) => !repeatedCharRegex.test(pwd), "at most 3 repeated, consecutive characters")
  .refine((pwd) => !escapeCharRegex.test(pwd), "No escape characters allowed")
  .refine(
    (pwd) => !lowEntropyRegexes.some((regex) => regex.test(pwd)),
    "Password contains personal info"
  );

const createUserInfoFormSchema = (isInvite: boolean) =>
  z.object({
    name: z.string().min(1, "Please, specify your name"),
    organizationName: isInvite
      ? z.string().optional()
      : z.string().min(1, "Please, specify your organization name").max(64),
    password: passwordSchema,
    attributionSource: z.string().optional()
  });

type UserInfoFormData = z.infer<ReturnType<typeof createUserInfoFormSchema>>;

interface UserInfoStepProps {
  onComplete: () => void;
  email: string;
  isInvite?: boolean;
}

const BREACH_CHECK_DEBOUNCE_MS = 1000;

export default function UserInfoStep({
  onComplete,
  email,
  isInvite = false
}: UserInfoStepProps): JSX.Element {
  const [showPassword, setShowPassword] = useState(false);
  const [breachWarning, setBreachWarning] = useState<string | null>(null);
  const breachTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutateAsync: completeSignup, isPending: isLoading } = useCompleteAccountSignup();
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<UserInfoFormData>({
    resolver: zodResolver(createUserInfoFormSchema(isInvite)),
    criteriaMode: "all",
    defaultValues: {
      name: "",
      organizationName: "",
      password: "",
      attributionSource: ""
    }
  });

  const passwordValue = watch("password");
  const passwordIssues = errors.password?.types
    ? (Object.values(errors.password.types).flat().filter(Boolean) as string[])
    : [];

  const debouncedBreachCheck = useCallback((pwd: string) => {
    if (breachTimerRef.current) {
      clearTimeout(breachTimerRef.current);
    }
    if (pwd.length < 14) {
      setBreachWarning(null);
      return;
    }
    breachTimerRef.current = setTimeout(async () => {
      const isBreached = await checkIsPasswordBreached(pwd);
      setBreachWarning(isBreached ? "Password was found in a data breach" : null);
    }, BREACH_CHECK_DEBOUNCE_MS);
  }, []);

  const onSubmit = async (formData: UserInfoFormData) => {
    // Run breach check synchronously on submit if not already checked
    const isBreached = await checkIsPasswordBreached(formData.password);
    if (isBreached) {
      setBreachWarning("Password was found in a data breach");
      return;
    }

    const response = await completeSignup({
      type: "email",
      email,
      password: formData.password,
      firstName: formData.name.split(" ")[0],
      lastName: formData.name.split(" ").slice(1).join(" "),
      organizationName: formData.organizationName || undefined,
      attributionSource: formData.attributionSource
    });

    SecurityClient.setSignupToken("");
    SecurityClient.setToken(response.token);
    SecurityClient.setProviderAuthToken("");

    if (isInfisicalCloud()) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "signup_completed" });
    }

    const userOrgs = await fetchOrganizations();
    const orgId = userOrgs[0]?.id;

    if (!isInvite) {
      await initProjectHelper({
        projectName: "Example Project"
      });
    }

    if (orgId) {
      localStorage.setItem("orgData.id", orgId);
    }

    onComplete();
  };

  const allIssues = [...passwordIssues, ...(breachWarning ? [breachWarning] : [])];

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <UnstableCard className="mx-auto w-full max-w-sm items-stretch gap-0 p-6">
        <UnstableCardHeader className="mb-4 gap-2">
          <UnstableCardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.65rem] font-medium text-transparent">
            {isInvite ? "Set up your account" : t("signup.step3-message")}
          </UnstableCardTitle>
        </UnstableCardHeader>
        <UnstableCardContent>
          <div className="flex w-full flex-col items-stretch py-2">
            <p className="mb-1 ml-1 text-sm font-medium text-bunker-300">Your Name</p>
            <UnstableInput
              {...register("name")}
              placeholder="Jane Doe"
              autoComplete="given-name"
              isError={!!errors.name}
            />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </div>
          {!isInvite && (
            <>
              <div className="flex w-full flex-col items-stretch py-2">
                <p className="mb-1 ml-1 text-sm font-medium text-bunker-300">Organization Name</p>
                <UnstableInput
                  {...register("organizationName")}
                  placeholder="Infisical"
                  maxLength={64}
                  isError={!!errors.organizationName}
                />
                {errors.organizationName && (
                  <FieldError>{errors.organizationName.message}</FieldError>
                )}
              </div>
              <div className="flex w-full flex-col items-stretch py-2">
                <p className="mb-1 ml-1 text-sm font-medium text-bunker-300">
                  Where did you hear about us? <span className="font-light">(optional)</span>
                </p>
                <TextArea {...register("attributionSource")} placeholder="" rows={2} />
              </div>
            </>
          )}
          <div className="flex w-full flex-col items-stretch py-2">
            <p className="mb-1 ml-1 text-sm font-medium text-bunker-300">
              {t("section.password.password")}
            </p>
            <InputGroup className="h-10">
              <InputGroupInput
                {...register("password", {
                  onChange(e) {
                    setBreachWarning(null);
                    debouncedBreachCheck(e.target.value);
                  }
                })}
                type={showPassword ? "text" : "password"}
                placeholder="Enter a strong password..."
                autoComplete="new-password"
                id="new-password"
              />
              <InputGroupAddon align="inline-end">
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </UnstableIconButton>
              </InputGroupAddon>
            </InputGroup>
            {allIssues.length > 0 && passwordValue.length > 0 && (
              <div className="mt-4 flex w-full flex-col items-start rounded-md border border-border bg-container px-3 py-2.5">
                <div className="mb-1 text-sm text-gray-400">
                  {t("section.password.validate-base")}
                </div>
                {allIssues.map((issue) => (
                  <div className="items-top flex flex-row justify-start" key={issue}>
                    <X className="mt-0.5 mr-2 size-4 shrink-0 text-danger" />
                    <p className="text-sm text-gray-400">{issue}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 w-full">
            <Button
              type="submit"
              onClick={handleSubmit(onSubmit)}
              variant="project"
              size="lg"
              isFullWidth
              isPending={isLoading}
              isDisabled={isLoading}
            >
              {String(t("signup.signup"))}
            </Button>
          </div>
        </UnstableCardContent>
      </UnstableCard>
    </div>
  );
}
