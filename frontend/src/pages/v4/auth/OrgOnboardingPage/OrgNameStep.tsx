import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { useCreateOrg } from "@app/hooks/api";
import { submitSignupOnboarding, useSelectOrganization } from "@app/hooks/api/auth/queries";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { v4Path } from "../../links";
import { AuthPage } from "../components/AuthPage";

import styles from "../auth.module.css";

const formSchema = z.object({
  organizationName: GenericResourceNameSchema,
  attributionSource: z.string().trim().max(512).optional()
});

type OrgNameFormData = z.infer<typeof formSchema>;

type Props = {
  onComplete: (orgId: string) => void;
  callbackPort?: number;
  isPreview?: boolean;
};

export const OrgNameStep = ({ onComplete, callbackPort, isPreview }: Props) => {
  const navigate = useNavigate();
  const { mutateAsync: createOrg, isPending: isCreating } = useCreateOrg({ invalidate: false });
  const { mutateAsync: selectOrganization, isPending: isSelecting } = useSelectOrganization();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<OrgNameFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { organizationName: "", attributionSource: "" }
  });

  const onSubmit = async ({ organizationName, attributionSource }: OrgNameFormData) => {
    if (isPreview) return;
    try {
      const organization = await createOrg({ name: organizationName });
      const { isMfaEnabled } = await selectOrganization({ organizationId: organization.id });
      if (isMfaEnabled) {
        navigate({
          to: v4Path("/login/select-organization"),
          search: { org_id: organization.id, callback_port: callbackPort }
        });
        return;
      }
      localStorage.setItem("orgData.id", organization.id);
      if (attributionSource) submitSignupOnboarding({ attributionSource }).catch(() => {});
      onComplete(organization.id);
    } catch {
      // The global mutation error handler reports the failure; stay on this step.
    }
  };

  return (
    <AuthPage
      pageTitle="Organization Setup"
      title="Name your organization"
      description="You can rename it anytime."
      bottom={
        <span>
          By signing up, you agree to our{" "}
          <a
            href="https://infisical.com/terms/cloud"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="https://infisical.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Privacy Policy
          </a>
          .
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={16}>
          <Field label="Organization name" error={errors.organizationName?.message}>
            <Input
              {...register("organizationName")}
              size="lg"
              maxLength={64}
              autoComplete="organization"
            />
          </Field>
          <Field label="Where did you hear about us?" optional>
            <Input
              {...register("attributionSource")}
              size="lg"
              autoComplete="off"
              placeholder="Hacker News, a friend, GitHub"
              maxLength={512}
            />
          </Field>
          <Button
            type="submit"
            variant="accent"
            size="lg"
            className="w-full"
            loading={isCreating || isSelecting}
          >
            Create organization
          </Button>
        </Stack>
      </form>
    </AuthPage>
  );
};
