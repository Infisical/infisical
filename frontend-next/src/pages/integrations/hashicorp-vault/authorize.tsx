import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

import { Button, Card, CardBody, CardTitle, FormControl, Input } from "../../../components/v2";

const formSchema = z.object({
  vaultURL: z.string().url({ message: "Invalid Hashicorp Vault URL" }),
  vaultNamespace: z.string().optional(),
  vaultRoleID: z.string().uuid({ message: "Role ID has be a valid UUID" }),
  vaultSecretID: z.string().uuid({ message: "Role ID has be a valid UUID" })
});

type TForm = z.infer<typeof formSchema>;

export default function HashiCorpVaultAuthorizeIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();

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
    try {
      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "hashicorp-vault",
        accessId: formData.vaultRoleID,
        accessToken: formData.vaultSecretID,
        url: formData.vaultURL,
        namespace: formData.vaultNamespace
      });
      router.push(`/integrations/hashicorp-vault/create?integrationAuthId=${integrationAuth.id}`);
    } catch (err) {
      console.error(err);
      let errorMessage: string = "Something went wrong!";
      if (axios.isAxiosError(err)) {
        const { message } = err?.response?.data as { message: string };
        errorMessage = message;
      }

      createNotification({
        text: errorMessage,
        type: "error"
      });
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize Vault Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After connecting to Vault, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="inline-flex items-center">
              <Image
                src="/images/integrations/Vault.png"
                height={30}
                width={30}
                alt="HCP Vault logo"
              />
            </div>
            <span className="ml-2.5">HashiCorp Vault Integration</span>
            <Link href="https://infisical.com/docs/integrations/cloud/hashicorp-vault" passHref>
              <a target="_blank" rel="noopener noreferrer">
                <div className="ml-2 mb-1 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="ml-1.5 mb-[0.07rem] text-xxs"
                  />
                </div>
              </a>
            </Link>
          </div>
        </CardTitle>
        <CardBody className="px-6 pb-6 pt-0">
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
}

HashiCorpVaultAuthorizeIntegrationPage.requireAuth = true;
