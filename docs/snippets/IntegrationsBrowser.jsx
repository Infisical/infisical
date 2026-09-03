import React, { useEffect, useMemo, useState } from "react";

export const IntegrationsBrowser = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("All");

  const types = ["All", "Framework", "Infrastructure", "Secret Sync"];

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("type");
    if (requested && types.includes(requested)) setSelectedType(requested);
  }, []);

  const tagColors = {
    "Web Frameworks": "blue",
    "Guides": "cyan",
    "Build Tools": "violet",
    "Process Managers": "fuchsia",
    "Kubernetes": "indigo",
    "Platforms": "teal",
    "CI/CD": "orange",
    "Other": "slate",
    "Cloud Providers": "sky",
    "Hosting": "emerald",
    "DevOps Tools": "violet",
    "Databases": "amber",
    "Security": "rose",
    "Monitoring": "cyan",
    "Data Analytics": "lime",
    "Identity & Auth": "purple",
  };

  const integrations = [
    { name: "React", path: "/integrations/frameworks/react", description: "Learn how to integrate Infisical with React applications for secure secret management.", type: "Framework", tag: "Web Frameworks" },
    { name: "Next.js", path: "/integrations/frameworks/nextjs", description: "Learn how to integrate Infisical with Next.js applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Vue", path: "/integrations/frameworks/vue", description: "Learn how to integrate Infisical with Vue.js applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Nuxt", path: "/integrations/frameworks/nuxt", description: "Learn how to integrate Infisical with Nuxt.js applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "SvelteKit", path: "/integrations/frameworks/sveltekit", description: "Learn how to integrate Infisical with SvelteKit applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Express, Fastify, Koa", path: "/integrations/frameworks/express", description: "Learn how to integrate Infisical with Express.js backend applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "NestJS", path: "/integrations/frameworks/nestjs", description: "Learn how to integrate Infisical with NestJS applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Django", path: "/integrations/frameworks/django", description: "Learn how to integrate Infisical with Django applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Flask", path: "/integrations/frameworks/flask", description: "Learn how to integrate Infisical with Flask applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Ruby on Rails", path: "/integrations/frameworks/rails", description: "Learn how to integrate Infisical with Ruby on Rails applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Spring Boot", path: "/integrations/frameworks/spring-boot-maven", description: "Learn how to integrate Infisical with Spring Boot applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Laravel", path: "/integrations/frameworks/laravel", description: "Learn how to integrate Infisical with Laravel applications.", type: "Framework", tag: "Web Frameworks" },
    { name: ".NET", path: "/integrations/frameworks/dotnet", description: "Learn how to integrate Infisical with .NET applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Fiber", path: "/integrations/frameworks/fiber", description: "Learn how to integrate Infisical with Fiber (Go) framework.", type: "Framework", tag: "Web Frameworks" },
    { name: "Gatsby", path: "/integrations/frameworks/gatsby", description: "Learn how to integrate Infisical with Gatsby applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Remix", path: "/integrations/frameworks/remix", description: "Learn how to integrate Infisical with Remix applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Vite", path: "/integrations/frameworks/vite", description: "Learn how to integrate Infisical with Vite applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "AB Initio", path: "/integrations/frameworks/ab-initio", description: "Learn how to integrate Infisical with AB Initio applications.", type: "Framework", tag: "Web Frameworks" },
    { name: "Node.js", path: "/documentation/guides/node", description: "Fetch secrets from a Node.js application with the Infisical SDK.", type: "Framework", tag: "Guides" },
    { name: "Python", path: "/documentation/guides/python", description: "Fetch secrets from a Python application with the Infisical SDK.", type: "Framework", tag: "Guides" },
    { name: "Next.js + Vercel", path: "/documentation/guides/nextjs-vercel", description: "Deliver secrets to a Next.js application during development and on Vercel.", type: "Framework", tag: "Guides" },
    { name: "Gradle", path: "/integrations/build-tools/gradle", description: "Use Infisical secrets in Gradle builds.", type: "Framework", tag: "Build Tools" },
    { name: "PM2", path: "/integrations/platforms/pm2", description: "Inject secrets into applications managed by PM2.", type: "Framework", tag: "Process Managers" },
    { name: "Kubernetes Operator", path: "/integrations/platforms/kubernetes/overview", description: "Deliver secrets to Kubernetes workloads with the Infisical Operator.", type: "Infrastructure", tag: "Kubernetes" },
    { name: "Kubernetes Operator Tutorial", path: "/documentation/guides/kubernetes-operator", description: "Follow an end-to-end tutorial for delivering secrets with the Kubernetes Operator.", type: "Infrastructure", tag: "Kubernetes" },
    { name: "Kubernetes Injector", path: "/integrations/platforms/kubernetes-injector", description: "Inject secrets into Kubernetes pods as environment variables.", type: "Infrastructure", tag: "Kubernetes" },
    { name: "Kubernetes CSI Provider", path: "/integrations/platforms/kubernetes-csi", description: "Mount Infisical secrets in Kubernetes with the Secrets Store CSI Driver.", type: "Infrastructure", tag: "Kubernetes" },
    { name: "Docker", path: "/integrations/platforms/docker", description: "Deliver secrets to Docker with Infisical.", type: "Infrastructure", tag: "Platforms" },
    { name: "Ansible", path: "/integrations/platforms/ansible", description: "Deliver secrets to Ansible with Infisical.", type: "Infrastructure", tag: "Platforms" },
    { name: "Apache Airflow", path: "/integrations/platforms/apache-airflow", description: "Deliver secrets to Apache Airflow with Infisical.", type: "Infrastructure", tag: "Platforms" },
    { name: "AWS Lambda", path: "/integrations/platforms/aws/lambda", description: "Deliver secrets to AWS Lambda with Infisical.", type: "Infrastructure", tag: "Platforms" },
    { name: "Infisical Proxy", path: "/integrations/platforms/infisical-proxy", description: "Deliver secrets to Infisical Proxy with Infisical.", type: "Infrastructure", tag: "Platforms" },
    { name: "Infisical Agent", path: "/integrations/platforms/infisical-agent", description: "Deliver secrets to Infisical Agent with Infisical.", type: "Infrastructure", tag: "Platforms" },
    { name: "Amazon ECS with Infisical Agent", path: "/integrations/platforms/ecs-with-agent", description: "Deliver secrets to Amazon ECS with Infisical Agent with Infisical.", type: "Infrastructure", tag: "Platforms" },
    { name: "Packer", path: "/integrations/frameworks/packer", description: "Deliver secrets to Packer with Infisical.", type: "Infrastructure", tag: "Platforms" },
    { name: "Pulumi", path: "/integrations/frameworks/pulumi", description: "Deliver secrets to Pulumi with Infisical.", type: "Infrastructure", tag: "Platforms" },
    { name: "Terraform", path: "/integrations/frameworks/terraform", description: "Deliver secrets to Terraform with Infisical.", type: "Infrastructure", tag: "Platforms" },
    { name: "AWS Amplify", path: "/integrations/cicd/aws-amplify", description: "Use Infisical secrets in AWS Amplify pipelines.", type: "Infrastructure", tag: "CI/CD" },
    { name: "Bitbucket Pipelines", path: "/integrations/cicd/bitbucket", description: "Use Infisical secrets in Bitbucket Pipelines pipelines.", type: "Infrastructure", tag: "CI/CD" },
    { name: "GitHub Actions", path: "/integrations/cicd/githubactions", description: "Use Infisical secrets in GitHub Actions pipelines.", type: "Infrastructure", tag: "CI/CD" },
    { name: "GitLab CI/CD", path: "/integrations/cicd/gitlab", description: "Use Infisical secrets in GitLab CI/CD pipelines.", type: "Infrastructure", tag: "CI/CD" },
    { name: "Jenkins", path: "/integrations/cicd/jenkins", description: "Use Infisical secrets in Jenkins pipelines.", type: "Infrastructure", tag: "CI/CD" },
    { name: "Backstage", path: "/integrations/external/backstage", description: "Deliver secrets to Backstage with Infisical.", type: "Infrastructure", tag: "Other" },
    { name: "Microsoft Power Apps", path: "/integrations/external/microsoft-power-apps", description: "Deliver secrets to Microsoft Power Apps with Infisical.", type: "Infrastructure", tag: "Other" },
    { name: "AWS Parameter Store", path: "/integrations/secret-syncs/aws-parameter-store", description: "Learn how to sync secrets from Infisical to AWS Parameter Store.", type: "Secret Sync", tag: "Cloud Providers" },
    { name: "AWS Secrets Manager", path: "/integrations/secret-syncs/aws-secrets-manager", description: "Learn how to sync secrets from Infisical to AWS Secrets Manager.", type: "Secret Sync", tag: "Cloud Providers" },
    { name: "Azure Key Vault", path: "/integrations/secret-syncs/azure-key-vault", description: "Learn how to sync secrets from Infisical to Azure Key Vault.", type: "Secret Sync", tag: "Cloud Providers" },
    { name: "Azure App Configuration", path: "/integrations/secret-syncs/azure-app-configuration", description: "Learn how to sync secrets from Infisical to Azure App Configuration.", type: "Secret Sync", tag: "Cloud Providers" },
    { name: "Azure DevOps", path: "/integrations/secret-syncs/azure-devops", description: "Learn how to sync secrets from Infisical to Azure DevOps.", type: "Secret Sync", tag: "CI/CD" },
    { name: "GCP Secret Manager", path: "/integrations/secret-syncs/gcp-secret-manager", description: "Learn how to sync secrets from Infisical to GCP Secret Manager.", type: "Secret Sync", tag: "Cloud Providers" },
    { name: "HashiCorp Vault", path: "/integrations/secret-syncs/hashicorp-vault", description: "Learn how to sync secrets from Infisical to HashiCorp Vault.", type: "Secret Sync", tag: "Security" },
    { name: "1Password", path: "/integrations/secret-syncs/1password", description: "Learn how to sync secrets from Infisical to 1Password.", type: "Secret Sync", tag: "Security" },
    { name: "Vercel", path: "/integrations/secret-syncs/vercel", description: "Learn how to sync secrets from Infisical to Vercel.", type: "Secret Sync", tag: "Hosting" },
    { name: "Netlify", path: "/integrations/secret-syncs/netlify", description: "Learn how to sync secrets from Infisical to Netlify.", type: "Secret Sync", tag: "Hosting" },
    { name: "Railway", path: "/integrations/secret-syncs/railway", description: "Learn how to sync secrets from Infisical to Railway.", type: "Secret Sync", tag: "Hosting" },
    { name: "Fly.io", path: "/integrations/secret-syncs/flyio", description: "Learn how to sync secrets from Infisical to Fly.io.", type: "Secret Sync", tag: "Hosting" },
    { name: "Render", path: "/integrations/secret-syncs/render", description: "Learn how to sync secrets from Infisical to Render.", type: "Secret Sync", tag: "Hosting" },
    { name: "Heroku", path: "/integrations/secret-syncs/heroku", description: "Learn how to sync secrets from Infisical to Heroku.", type: "Secret Sync", tag: "Hosting" },
    { name: "DigitalOcean App Platform", path: "/integrations/secret-syncs/digital-ocean-app-platform", description: "Learn how to sync secrets from Infisical to DigitalOcean App Platform.", type: "Secret Sync", tag: "Hosting" },
    { name: "Supabase", path: "/integrations/secret-syncs/supabase", description: "Learn how to sync secrets from Infisical to Supabase.", type: "Secret Sync", tag: "Databases" },
    { name: "Checkly", path: "/integrations/secret-syncs/checkly", description: "Learn how to sync secrets from Infisical to Checkly.", type: "Secret Sync", tag: "Monitoring" },
    { name: "CircleCI", path: "/integrations/secret-syncs/circleci", description: "Learn how to sync secrets from Infisical to CircleCI.", type: "Secret Sync", tag: "CI/CD" },
    { name: "GitHub", path: "/integrations/secret-syncs/github", description: "Learn how to sync secrets from Infisical to GitHub.", type: "Secret Sync", tag: "CI/CD" },
    { name: "GitLab", path: "/integrations/secret-syncs/gitlab", description: "Learn how to sync secrets from Infisical to GitLab.", type: "Secret Sync", tag: "CI/CD" },
    { name: "TeamCity", path: "/integrations/secret-syncs/teamcity", description: "Learn how to sync secrets from Infisical to TeamCity.", type: "Secret Sync", tag: "CI/CD" },
    { name: "Bitbucket", path: "/integrations/secret-syncs/bitbucket", description: "Learn how to sync secrets from Infisical to Bitbucket.", type: "Secret Sync", tag: "CI/CD" },
    { name: "Terraform Cloud", path: "/integrations/secret-syncs/terraform-cloud", description: "Learn how to sync secrets from Infisical to Terraform Cloud.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Spacelift", path: "/integrations/secret-syncs/spacelift", description: "Learn how to sync secrets from Infisical to Spacelift.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Cloudflare Pages", path: "/integrations/secret-syncs/cloudflare-pages", description: "Learn how to sync secrets from Infisical to Cloudflare Pages.", type: "Secret Sync", tag: "Hosting" },
    { name: "Cloudflare Workers", path: "/integrations/secret-syncs/cloudflare-workers", description: "Learn how to sync secrets from Infisical to Cloudflare Workers.", type: "Secret Sync", tag: "Cloud Providers" },
    { name: "Databricks", path: "/integrations/secret-syncs/databricks", description: "Learn how to sync secrets from Infisical to Databricks.", type: "Secret Sync", tag: "Data Analytics" },
    { name: "Windmill", path: "/integrations/secret-syncs/windmill", description: "Learn how to sync secrets from Infisical to Windmill.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Camunda", path: "/integrations/secret-syncs/camunda", description: "Learn how to sync secrets from Infisical to Camunda.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Humanitec", path: "/integrations/secret-syncs/humanitec", description: "Learn how to sync secrets from Infisical to Humanitec.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "OCI Vault", path: "/integrations/secret-syncs/oci-vault", description: "Learn how to sync secrets from Infisical to OCI Vault.", type: "Secret Sync", tag: "Cloud Providers" },
    { name: "Zabbix", path: "/integrations/secret-syncs/zabbix", description: "Learn how to sync secrets from Infisical to Zabbix.", type: "Secret Sync", tag: "Monitoring" },
    { name: "Laravel Forge", path: "/integrations/secret-syncs/laravel-forge", description: "Learn how to sync secrets from Infisical to Laravel Forge.", type: "Secret Sync", tag: "Hosting" },
    { name: "Chef", path: "/integrations/secret-syncs/chef", description: "Learn how to sync secrets from Infisical to Chef.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Northflank", path: "/integrations/secret-syncs/northflank", description: "Learn how to sync secrets from Infisical to Northflank projects.", type: "Secret Sync", tag: "Hosting" },
    { name: "Ona", path: "/integrations/secret-syncs/ona", description: "Learn how to sync secrets from Infisical to Ona (Gitpod) projects or user environments.", type: "Secret Sync", tag: "Hosting" },
    { name: "Octopus Deploy", path: "/integrations/secret-syncs/octopus-deploy", description: "Learn how to sync secrets from Infisical to Octopus Deploy.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Azure Entra ID SCIM", path: "/integrations/secret-syncs/azure-entra-id-scim", description: "Learn how to sync SCIM provisioning tokens from Infisical to Azure Entra ID.", type: "Secret Sync", tag: "Identity & Auth" },
    { name: "Infisical", path: "/integrations/secret-syncs/external-infisical", description: "Learn how to sync secrets from one Infisical instance to another.", type: "Secret Sync", tag: "Security" },
    { name: "OVH", path: "/integrations/secret-syncs/ovh", description: "Learn how to sync secrets from Infisical to OVH Secret Manager.", type: "Secret Sync", tag: "Cloud Providers" },
    { name: "Travis CI", path: "/integrations/secret-syncs/travis-ci", description: "Learn how to sync secrets from Infisical to Travis CI.", type: "Secret Sync", tag: "CI/CD" },
    { name: "Snowflake", path: "/integrations/secret-syncs/snowflake", description: "Learn how to sync secrets from Infisical to Snowflake.", type: "Secret Sync", tag: "Databases" },
    { name: "Trigger.dev", path: "/integrations/secret-syncs/trigger-dev", description: "Learn how to sync secrets from Infisical to Trigger.dev.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Rundeck", path: "/integrations/secret-syncs/rundeck", description: "Learn how to sync secrets from Infisical to Rundeck.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Qovery", path: "/integrations/secret-syncs/qovery", description: "Learn how to sync secrets from Infisical to Qovery.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Cloud 66", path: "/integrations/secret-syncs/cloud-66", description: "Learn how to sync secrets from Infisical to Cloud66.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Hasura Cloud", path: "/integrations/secret-syncs/hasura-cloud", description: "Learn how to sync secrets from Infisical to Hasura Cloud.", type: "Secret Sync", tag: "Hosting" },
    { name: "Daytona", path: "/integrations/secret-syncs/daytona", description: "Learn how to sync secrets from Infisical to a Daytona organization.", type: "Secret Sync", tag: "DevOps Tools" },
    { name: "Devin", path: "/integrations/secret-syncs/devin", description: "Learn how to sync secrets from Infisical to Devin.", type: "Secret Sync", tag: "DevOps Tools" },
  ].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const filteredIntegrations = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    return integrations.filter((integration) => {
      const matchesType = selectedType === "All" || integration.type === selectedType;
      const matchesSearch =
        !normalizedSearchTerm ||
        integration.name.toLowerCase().includes(normalizedSearchTerm) ||
        integration.description.toLowerCase().includes(normalizedSearchTerm) ||
        integration.type.toLowerCase().includes(normalizedSearchTerm) ||
        integration.tag.toLowerCase().includes(normalizedSearchTerm);

      return matchesType && matchesSearch;
    });
  }, [searchTerm, selectedType]);

  return (
    <div className="max-w-none">
      <div className="relative mb-6 w-full">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg
            aria-hidden="true"
            className="h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </div>
        <label className="sr-only" htmlFor="integration-search">
          Search integrations
        </label>
        <input
          id="integration-search"
          type="search"
          placeholder="Search integrations..."
          className="block w-full border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-500 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:border-gray-700 dark:bg-black dark:text-gray-100 dark:placeholder-gray-400"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2" aria-label="Filter by integration type">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={selectedType === type}
            onClick={() => setSelectedType(type)}
            className={`border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
              selectedType === type
                ? "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                : "border-gray-200 bg-white text-gray-700 hover:border-yellow-200 hover:bg-yellow-50 dark:border-gray-700 dark:bg-black dark:text-gray-200 dark:hover:border-yellow-700 dark:hover:bg-yellow-950/20"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
        {filteredIntegrations.length} integration{filteredIntegrations.length === 1 ? "" : "s"} found
      </p>

      {filteredIntegrations.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredIntegrations.map((integration) => (
            <a
              key={integration.path}
              href={integration.path}
              className="group block border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-yellow-200 hover:bg-yellow-50/50 focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:border-gray-700 dark:bg-black dark:hover:border-yellow-700 dark:hover:bg-yellow-950/20"
            >
              <h2 className="m-0 mb-2 text-base font-medium leading-tight text-gray-900 dark:text-gray-100">
                {integration.name}
              </h2>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <span className="ifx-tag ifx-tag--neutral">{integration.type}</span>
                {integration.tag !== integration.type && (
                  <span className={`ifx-tag ifx-tag--${tagColors[integration.tag] || "neutral"}`}>
                    {integration.tag}
                  </span>
                )}
              </div>
              <p className="m-0 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {integration.description}
              </p>
            </a>
          ))}
        </div>
      ) : (
        <div className="border border-gray-200 py-8 text-center dark:border-gray-700">
          <p className="m-0 text-sm text-gray-500 dark:text-gray-400">
            No integrations match your search and type.
          </p>
        </div>
      )}
    </div>
  );
};
