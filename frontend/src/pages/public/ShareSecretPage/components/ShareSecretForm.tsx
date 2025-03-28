import { useState, ChangeEvent, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faRedo, faEye, faEyeSlash, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, Input, Select, SelectItem } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
import { useCreatePublicSharedSecret, useCreateSharedSecret } from "@app/hooks/api";
import { SecretSharingAccessType } from "@app/hooks/api/secretSharing";

// values in ms
const expiresInOptions = [
  { label: "5 min", value: 5 * 60 * 1000 },
  { label: "30 min", value: 30 * 60 * 1000 },
  { label: "1 hour", value: 60 * 60 * 1000 },
  { label: "1 day", value: 24 * 60 * 60 * 1000 },
  { label: "7 days", value: 7 * 24 * 60 * 60 * 1000 },
  { label: "14 days", value: 14 * 24 * 60 * 60 * 1000 },
  { label: "30 days", value: 30 * 24 * 60 * 60 * 1000 }
];

const viewLimitOptions = [
  { label: "1", value: 1 },
  { label: "Unlimited", value: -1 }
];

const DEFAULT_EXPIRES_IN = expiresInOptions[2].value.toString(); // 1 hour (3600000)
const DEFAULT_VIEW_LIMIT = viewLimitOptions[1].value.toString(); // unlimited (-1)

const schema = z.object({
  name: z.string().optional(),
  password: z.string().optional(),
  secret: z.string().min(1),
  expiresIn: z.string(),
  viewLimit: z.string(),
  accessType: z.nativeEnum(SecretSharingAccessType).optional()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  isPublic: boolean; // whether or not this is a public (non-authenticated) secret sharing form
  value?: string;
  allowSecretSharingOutsideOrganization?: boolean;
};

export const ShareSecretForm = ({
  isPublic,
  value,
  allowSecretSharingOutsideOrganization = true
}: Props) => {
  const [secretLink, setSecretLink] = useState("");
  const [isSecretVisible, setIsSecretVisible] = useState(true);
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [formTouched, setFormTouched] = useState(false);
  const [secretModified, setSecretModified] = useState(false);
  
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const publicSharedSecretCreator = useCreatePublicSharedSecret();
  const privateSharedSecretCreator = useCreateSharedSecret();
  const createSharedSecret = isPublic ? publicSharedSecretCreator : privateSharedSecretCreator;

  const {
    control,
    reset,
    handleSubmit,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      secret: value || ""
    },
    mode: "onChange"
  });
  
  const password = watch("password");
  const secret = watch("secret");
  
  const handleSecretBlur = () => {
    setSecretModified(true);
  };

  const handleSecretChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value) {
      setSecretModified(true);
    }
  };

  const [displayedSecret, setDisplayedSecret] = useState("");
  
  useEffect(() => {
    if (isSecretVisible) {
      setDisplayedSecret(secret || "");
    } else {
      setDisplayedSecret(secret ? "*".repeat(secret.length) : "");
    }
  }, [secret, isSecretVisible]);

  const passwordsMatch = password && passwordConfirmation && password === passwordConfirmation;
  const passwordMismatch = password && passwordConfirmation && password !== passwordConfirmation;
  
  const onePasswordFieldEmpty = Boolean(password) !== Boolean(passwordConfirmation);
  
  const hasPasswordMismatch = password && passwordConfirmation && !passwordsMatch;
  const isSecretMissing = !secret;
  const isSubmitDisabled = isSubmitting || onePasswordFieldEmpty || hasPasswordMismatch || isSecretMissing;

  const onFormSubmit = async ({
    name,
    password,
    secret,
    expiresIn,
    viewLimit,
    accessType
  }: FormData) => {
    try {
      const expiresAt = new Date(new Date().getTime() + Number(expiresIn));

      const { id } = await createSharedSecret.mutateAsync({
        name,
        password,
        secretValue: secret,
        expiresAt,
        expiresAfterViews: viewLimit === DEFAULT_VIEW_LIMIT ? undefined : Number(viewLimit),
        accessType
      });

      const link = `${window.location.origin}/shared/secret/${id}`;

      setSecretLink(link);
      setPasswordConfirmation("");
      reset({
        secret: "",
        password: "",
        expiresIn: DEFAULT_EXPIRES_IN,
        viewLimit: DEFAULT_VIEW_LIMIT,
        ...(isPublic ? {} : { accessType: SecretSharingAccessType.Organization })
      });

      navigator.clipboard.writeText(link);
      setCopyTextSecret("secret");

      createNotification({
        text: "Shared secret link copied to clipboard.",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to create a shared secret.",
        type: "error"
      });
    }
  };

  const hasSecretLink = Boolean(secretLink);

  return !hasSecretLink ? (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      {!isPublic && (
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Name (Optional)"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                placeholder="API Key"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
            </FormControl>
          )}
        />
      )}
      <Controller
        control={control}
        name="secret"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Your Secret"
            isError={Boolean(error) && secretModified}
            errorText={!secret && secretModified ? "Secret must contain at least 1 character(s)" : ""}
            className="mb-2"
            isRequired
          >
            <div className="relative">
              <textarea
                placeholder="Enter sensitive data to share via an encrypted link..."
                className="h-40 min-h-[70px] w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5 text-bunker-300 outline-none transition-all placeholder:text-mineshaft-400 hover:border-primary-400/30 focus:border-primary-400/50"
                disabled={value !== undefined}
                ref={field.ref}
                name={field.name}
                value={displayedSecret}
                onChange={(e) => {
                  if (isSecretVisible) {
                    field.onChange(e);
                    handleSecretChange(e);
                  }
                }}
                onBlur={(e) => {
                  field.onBlur();
                  handleSecretBlur();
                }}
                onKeyDown={(e) => {
                  const isCopyOrPasteShortcut = 
                    (e.ctrlKey && (e.key === 'v' || e.key === 'c')) || 
                    (e.metaKey && (e.key === 'v' || e.key === 'c'));
                    
                  if (!isSecretVisible && isCopyOrPasteShortcut) {
                    e.preventDefault();
                  }
                }}
                onContextMenu={(e) => {
                  if (!isSecretVisible) {
                    e.preventDefault();
                  }
                }}
              />
              <div className="absolute right-2 top-2">
                <IconButton
                  ariaLabel={isSecretVisible ? "hide secret" : "show secret"}
                  colorSchema="secondary"
                  className="group relative"
                  onClick={() => setIsSecretVisible(!isSecretVisible)}
                >
                  <FontAwesomeIcon icon={isSecretVisible ? faEye : faEyeSlash} />
                </IconButton>
              </div>
            </div>
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Password"
            isError={Boolean(error)}
            errorText={error?.message}
            isOptional
          >
            <Input
              {...field}
              placeholder="Password"
              type="password"
              autoComplete="new-password"
              autoCorrect="off"
              spellCheck="false"
              aria-autocomplete="none"
              data-form-type="other"
            />
          </FormControl>
        )}
      />
      
      <div 
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ 
          maxHeight: password ? '150px' : '0',
          opacity: password ? 1 : 0,
          visibility: password ? 'visible' : 'hidden',
          marginTop: password ? '1rem' : '0',
          marginBottom: password ? '1rem' : '0'
        }}
      >
        <FormControl
          label="Confirm Password"
          isError={false}
          errorText=""
          isOptional
        >
          <div className="relative">
            <Input
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              placeholder="Confirm password"
              type="password"
              autoComplete="new-password"
              autoCorrect="off"
              spellCheck="false"
              aria-autocomplete="none"
              data-form-type="other"
              isError={false}
              style={{ outline: 'none', boxShadow: 'none', border: 'none' }}
              containerClassName={
                passwordsMatch 
                  ? "border-green-500" 
                  : passwordMismatch
                    ? "border-red-500"
                    : (password && !passwordConfirmation) 
                      ? "border-amber-500 animate-pulse" 
                      : "border-mineshaft-600"
              }
            />
            
            {passwordMismatch && (
              <div className="text-xs text-red-500 mt-1 flex items-center">
                <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
                Passwords must match
              </div>
            )}
            
            {passwordsMatch && (
              <div className="absolute right-2 top-[50%] -translate-y-1/2">
                <FontAwesomeIcon icon={faCheck} className="text-green-500" />
              </div>
            )}
            {password && !passwordConfirmation && (
              <div className="absolute right-2 top-[50%] -translate-y-1/2">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500" />
              </div>
            )}
          </div>
        </FormControl>
      </div>

      <Controller
        control={control}
        name="expiresIn"
        defaultValue={DEFAULT_EXPIRES_IN}
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Expires In" errorText={error?.message} isError={Boolean(error)}>
            <Select
              defaultValue={field.value}
              {...field}
              onValueChange={(e) => onChange(e)}
              className="w-full"
            >
              {expiresInOptions.map(({ label, value: expiresInValue }) => (
                <SelectItem value={String(expiresInValue || "")} key={label}>
                  {label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="viewLimit"
        defaultValue={DEFAULT_VIEW_LIMIT}
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Max Views" errorText={error?.message} isError={Boolean(error)}>
            <Select
              defaultValue={field.value}
              {...field}
              onValueChange={(e) => onChange(e)}
              className="w-full"
            >
              {viewLimitOptions.map(({ label, value: viewLimitValue }) => (
                <SelectItem value={String(viewLimitValue || "")} key={label}>
                  {label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      {!isPublic && (
        <Controller
          control={control}
          name="accessType"
          defaultValue={SecretSharingAccessType.Organization}
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl label="General Access" errorText={error?.message} isError={Boolean(error)}>
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(e) => onChange(e)}
                className="w-full"
              >
                {allowSecretSharingOutsideOrganization && (
                  <SelectItem value={SecretSharingAccessType.Anyone}>Anyone</SelectItem>
                )}
                <SelectItem value={SecretSharingAccessType.Organization}>
                  People within your organization
                </SelectItem>
              </Select>
            </FormControl>
          )}
        />
      )}
      <Button
        className="mt-4"
        size="sm"
        type="submit"
        isLoading={isSubmitting}
        isDisabled={isSubmitDisabled}
        variant={isSubmitDisabled ? "outline" : "primary"}
        onClick={() => setFormTouched(true)}
      >
        Create Secret Link
      </Button>
      
      {onePasswordFieldEmpty && formTouched && (
        <div className="text-xs text-amber-500 mt-1 flex items-center">
          <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
          {password ? "Please confirm your password" : "Please enter your password"}
        </div>
      )}
    </form>
  ) : (
    <>
      <div className="mr-2 flex items-center justify-end rounded-md bg-white/[0.05] p-2 text-base text-gray-400">
        <p className="mr-4 break-all">{secretLink}</p>
        <IconButton
          ariaLabel="copy icon"
          colorSchema="secondary"
          className="group relative ml-2"
          onClick={() => {
            navigator.clipboard.writeText(secretLink);
            setCopyTextSecret("Copied");
          }}
        >
          <FontAwesomeIcon icon={isCopyingSecret ? faCheck : faCopy} />
        </IconButton>
      </div>
      <Button
        className="mt-4 w-full bg-mineshaft-700 py-3 text-bunker-200"
        colorSchema="primary"
        variant="outline_bg"
        size="sm"
        onClick={() => {
          setSecretLink("");
          setPasswordConfirmation("");
          setFormTouched(false);
          setSecretModified(false);
          setIsSecretVisible(true);
          reset({
            secret: "",
            password: "",
            expiresIn: DEFAULT_EXPIRES_IN,
            viewLimit: DEFAULT_VIEW_LIMIT,
            ...(isPublic ? {} : { accessType: SecretSharingAccessType.Organization })
          });
        }}
        rightIcon={<FontAwesomeIcon icon={faRedo} className="pl-2" />}
      >
        Share Another Secret
      </Button>
    </>
  );
};
