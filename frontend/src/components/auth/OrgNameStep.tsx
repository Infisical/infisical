import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useCreateOrg } from "@app/hooks/api";
import { useSelectOrganization } from "@app/hooks/api/auth/queries";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { AuthPagePanel } from "./AuthPagePanel";

const formSchema = z.object({ organizationName: GenericResourceNameSchema });

type OrgNameFormData = z.infer<typeof formSchema>;

interface OrgNameStepProps {
  onComplete: (orgId: string) => void;
}

export default function OrgNameStep({ onComplete }: OrgNameStepProps): JSX.Element {
  const navigate = useNavigate();
  const { mutateAsync: createOrg, isPending: isCreating } = useCreateOrg({ invalidate: false });
  const { mutateAsync: selectOrganization, isPending: isSelecting } = useSelectOrganization();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<OrgNameFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { organizationName: "" }
  });

  const onSubmit = async ({ organizationName }: OrgNameFormData) => {
    try {
      const organization = await createOrg({ name: organizationName });
      const { isMfaEnabled } = await selectOrganization({ organizationId: organization.id });
      if (isMfaEnabled) {
        navigate({
          to: "/login/select-organization",
          search: { org_id: organization.id }
        });
        return;
      }
      localStorage.setItem("orgData.id", organization.id);
      onComplete(organization.id);
    } catch {
      // The global mutation error handler already surfaces a toast; stay on this step.
    }
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <AuthPagePanel>
        <CardHeader className="mb-4 gap-2">
          <CardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
            Name your organization
          </CardTitle>
          <CardDescription className="text-sm text-label">
            This is your team&apos;s shared home in Infisical. You can rename it anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
            <Field data-invalid={Boolean(errors.organizationName)}>
              <FieldLabel className="sr-only" htmlFor="sso-organization-name">
                Organization Name
              </FieldLabel>
              <Input
                {...register("organizationName")}
                id="sso-organization-name"
                placeholder="Organization Name"
                maxLength={64}
                autoComplete="organization"
                isError={Boolean(errors.organizationName)}
              />
              {errors.organizationName ? (
                <FieldError>{errors.organizationName.message}</FieldError>
              ) : null}
            </Field>
            <Button
              type="submit"
              variant="project"
              size="lg"
              isFullWidth
              isPending={isCreating || isSelecting}
            >
              Continue
            </Button>
          </form>
        </CardContent>
      </AuthPagePanel>
    </div>
  );
}
