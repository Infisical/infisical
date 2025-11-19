import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { Button, Card, CardBody, CardTitle, FormControl, Input } from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

const formSchema = z.object({
  vaultURL: z.string().url({ message: "Invalid Hashicorp Vault URL" }),
  vaultNamespace: z.string().optional(),
  vaultRoleID: z.string().uuid({ message: "Role ID has be a valid UUID" }),
  vaultSecretID: z.string().uuid({ message: "Role ID has be a valid UUID" })
});

type TForm = z.infer<typeof formSchema>;

export const HashicorpVaultAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vaultURL: "",
      vaultNamespace: "",
      vaultRoleID: "",
      vaultSecretID: ""
    }
  });

  const handleFormSubmit = async (formData: TForm) => {
    const integrationAuth = await mutateAsync({
      workspaceId: currentProject.id,
      integration: "hashicorp-vault",
      accessId: formData.vaultRoleID,
      accessToken: formData.vaultSecretID,
      url: formData.vaultURL,
      namespace: formData.vaultNamespace
    });
    navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/hashicorp-vault/create",
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id
      },
      search: {
        integrationAuthId: integrationAuth.id
      }
    });
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Authorize Vault Integration</title>
      </Helmet>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After connecting to Vault, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="inline-flex items-center">
              <img
                src="/images/integrations/Vault.png"
                height={30}
                width={30}
                alt="HCP Vault logo"
              />
            </div>
            <span className="ml-2.5">HashiCorp Vault Integration</span>
            <a
              href="https://infisical.com/docs/integrations/cloud/hashicorp-vault"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="text-xxs mb-[0.07rem] ml-1.5"
                />
              </div>
            </a>
          </div>
        </CardTitle>
        <CardBody className="px-6 pt-0 pb-6">
          <form onSubmit={handleSubmit(handleFormSubmit)} noValidate>
            <Controller
              control={control}
              name="vaultURL"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Vault Cluster URL"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                >
                  <Input autoCorrect="off" spellCheck={false} placeholder="" {...field} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="vaultNamespace"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Vault Namespace"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired={false}
                >
                  <Input
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="admin/education"
                    {...field}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="vaultRoleID"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Vault RoleID"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                >
                  <Input
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="aaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaa"
                    {...field}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="vaultSecretID"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Vault SecretID"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                >
                  <Input
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="aaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaa"
                    {...field}
                  />
                </FormControl>
              )}
            />
            <Button type="submit" isLoading={isSubmitting}>
              Connect to Vault
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
};
