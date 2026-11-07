import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { Toaster, toast } from "@app/components/v4/ui/sonner";
import {
  fetchOrganizations,
  organizationKeys,
  useCreateOrg,
  useLogoutUser,
  useSelectOrganization
} from "@app/hooks/api";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { AuthPage } from "../components/AuthPage";

const PERSONAL_ORG_NAME = "Personal Org";
const CREATION_STARTED_KEY = "personalOrgCreationStarted";

const generatePersonalOrgName = (existingNames: string[]) => {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const isTaken = (candidate: string) => taken.has(candidate.trim().toLowerCase());
  if (!isTaken(PERSONAL_ORG_NAME)) return PERSONAL_ORG_NAME;
  let suffix = 1;
  while (isTaken(`${PERSONAL_ORG_NAME} ${suffix}`)) suffix += 1;
  return `${PERSONAL_ORG_NAME} ${suffix}`;
};

const formSchema = z.object({
  name: GenericResourceNameSchema.nonempty({ message: "Name is required" })
});

const CreateOrgForm = ({ isPreview }: { isPreview: boolean }) => {
  const navigate = useNavigate();
  const { mutateAsync: createOrg } = useCreateOrg({ invalidate: false });
  const { mutateAsync: selectOrg } = useSelectOrganization();
  const logout = useLogoutUser();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" }
  });

  const onSubmit = async ({ name }: z.infer<typeof formSchema>) => {
    if (isPreview) return;
    const organization = await createOrg({ name });
    await selectOrg({ organizationId: organization.id });
    localStorage.setItem("orgData.id", organization.id);
    toast.success("Successfully created organization");
    navigate({ to: "/v4/organizations/$orgId/projects", params: { orgId: organization.id } });
  };

  return (
    <AuthPage variant="focused" pageTitle="Create Organization" title="Create an organization">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={16}>
          <Field label="Name" error={errors.name?.message}>
            <Input {...register("name")} size="lg" autoComplete="organization" />
          </Field>
          <Inline justify="between">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (isPreview) return;
                await logout.mutateAsync();
                navigate({ to: "/v4/login" });
              }}
            >
              Log out
            </Button>
            <Button type="submit" variant="accent" loading={isSubmitting}>
              Create organization
            </Button>
          </Inline>
        </Stack>
      </form>
    </AuthPage>
  );
};

export const NoOrgPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { preview } = useSearch({ from: "/v4/organizations/none" });
  const { mutateAsync: createOrg } = useCreateOrg({ invalidate: false });
  const { mutateAsync: selectOrg } = useSelectOrganization();
  const hasRun = useRef(false);
  const [failed, setFailed] = useState(preview === "failed");

  useEffect(() => {
    if (preview || hasRun.current) return;
    hasRun.current = true;
    if (sessionStorage.getItem(CREATION_STARTED_KEY)) return;
    sessionStorage.setItem(CREATION_STARTED_KEY, "true");

    const createPersonalOrg = async () => {
      const existingOrgs = await fetchOrganizations().catch(() => []);
      const orgName = generatePersonalOrgName(existingOrgs.map((org) => org.name));

      let organization;
      try {
        organization = await createOrg({ name: orgName });
      } catch {
        toast.error("Couldn't create your organization automatically. Please create one below.");
        setFailed(true);
        hasRun.current = false;
        sessionStorage.removeItem(CREATION_STARTED_KEY);
        return;
      }

      try {
        await selectOrg({ organizationId: organization.id });
        localStorage.setItem("orgData.id", organization.id);
        navigate({ to: "/v4/organizations/$orgId/projects", params: { orgId: organization.id } });
      } catch {
        toast.error(
          "Created your organization, but couldn't open it automatically. Redirecting..."
        );
        await queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
        navigate({ to: "/v4/login/select-organization" });
      } finally {
        sessionStorage.removeItem(CREATION_STARTED_KEY);
      }
    };

    createPersonalOrg();
  }, [createOrg, selectOrg, navigate, queryClient]);

  return (
    <>
      {failed ? (
        <CreateOrgForm isPreview={Boolean(preview)} />
      ) : (
        <Loader size="page" label="Setting up your organization" className="flex-1" />
      )}
      <Toaster />
    </>
  );
};
