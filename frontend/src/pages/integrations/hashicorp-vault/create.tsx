import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import queryString from "query-string";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { isValidPath } from "@app/helpers/string";
import { useCreateIntegration } from "@app/hooks/api";

import {
  Button,
  Card,
  CardBody,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "../../../components/v2";
import { useGetIntegrationAuthById } from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

const generateFormSchema = (availableEnvironmentNames: string[]) => {
  return z.object({
    secretPath: z.string().min(1).refine((val) => isValidPath(val), {
      message: "Vault secret path has to be a valid path"
    }),
    vaultEnginePath: z
      .string()
      .min(1)
      .refine((val) => isValidPath(val), {
        message: "Vault engine path has to be a valid path"
      }),
    vaultSecretPath: z
      .string()
      .min(1)
      .refine((val) => isValidPath(val), {
        message: "Vault secret path has to be a valid path"
      }),
    selectedSourceEnvironment: z.enum(availableEnvironmentNames as any as [string, ...string[]])
  });
};

type TForm = z.infer<ReturnType<typeof generateFormSchema>>;

export default function HashiCorpVaultCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth, isLoading: isintegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );

  const formSchema = useMemo(() => {
    return generateFormSchema(workspace?.environments.map((env) => env.slug) ?? []);
  }, [workspace?.environments]);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      secretPath: "/",
      vaultEnginePath: "",
      vaultSecretPath: "",
      selectedSourceEnvironment: ""
    }
  });

  const handleFormSubmit = async (formData: TForm) => {
    try {
      if (!integrationAuth?.id) return;
      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: formData.vaultEnginePath,
        sourceEnvironment: formData.selectedSourceEnvironment,
        path: formData.vaultSecretPath,
        secretPath: formData.secretPath
      });
      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
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

  return integrationAuth && workspace ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Head>
        <title>Set Up Vault Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select which environment or folder in Infisical you want to sync to which path in HashiCorp Vault."
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
        <CardBody>
          <form onSubmit={handleSubmit(handleFormSubmit)} noValidate>
            <Controller
              control={control}
              name="selectedSourceEnvironment"
              render={({ field, fieldState: { error } }) => (
                <FormControl errorText={error?.message}
                isError={Boolean(error)} isRequired label="Project Environment" >
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    className="w-full border border-mineshaft-500"
                  >
                    {workspace?.environments.map((sourceEnvironment) => (
                      <SelectItem
                        value={sourceEnvironment.slug}
                        key={`vault-environment-${sourceEnvironment.slug}`}
                      >
                        {sourceEnvironment.name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="secretPath"
              render={({ field, fieldState: { error } }) => (
                <FormControl errorText={error?.message}
                isError={Boolean(error)} isRequired label="Secrets Path" helperText="A path to your secrets in Infisical.">
                  <Input {...field} autoCorrect="off" spellCheck={false} placeholder="/" />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="vaultEnginePath"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Vault KV Secrets Engine Path"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  helperText="A path where your KV Secrets Engine is enabled."
                  isRequired
                >
                  <Input autoCorrect="off" spellCheck={false} {...field} placeholder="kv" />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="vaultSecretPath"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Vault Secret(s) Path"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  helperText="A path for storing secrets within the KV Secrets Engine."
                  isRequired
                >
                  <Input autoCorrect="off" spellCheck={false} {...field} placeholder="machine/dev" />
                </FormControl>
              )}
            />

            <Button
              type="submit"
              isLoading={isSubmitting}
            >
              Create Integration
            </Button>
          </form>
        </CardBody>
      </Card>
      <div className="mt-6 w-full max-w-md border-t border-mineshaft-800" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-mineshaft-200" />{" "}
          <span className="text-md ml-3 text-mineshaft-100">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-mineshaft-300">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in Vault with secrets from Infisical.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up Vault Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      {isintegrationAuthLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-center text-mineshaft-200">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
              target="_blank"
              rel="noopener noreferrer"
              href="mailto:support@infisical.com"
            >
              support@infisical.com
            </a>{" "}
            if the issue persists.
          </p>
        </div>
      )}
    </div>
  );
}

HashiCorpVaultCreateIntegrationPage.requireAuth = true;
