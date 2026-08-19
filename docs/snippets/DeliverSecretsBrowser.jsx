export const DeliverSecretsBrowser = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const categories = [
  "All",
  "Application Development",
  "Kubernetes",
  "Infrastructure",
  "Secret Syncs",
  "CI/CD",
  "Other",
];

  const entries = [
  {
    name: "Local Development",
    path: "/documentation/guides/local-development",
    description: "Inject secrets into local applications and scripts with the Infisical CLI.",
    category: "Application Development",
  },
  {
    name: "Node.js SDK",
    path: "/documentation/guides/node",
    description: "Fetch secrets from a Node.js application with the Infisical SDK.",
    category: "Application Development",
  },
  {
    name: "Python SDK",
    path: "/documentation/guides/python",
    description: "Fetch secrets from a Python application with the Infisical SDK.",
    category: "Application Development",
  },
  {
    name: "Next.js + Vercel",
    path: "/documentation/guides/nextjs-vercel",
    description: "Deliver secrets to a Next.js application during development and on Vercel.",
    category: "Application Development",
  },
  ...[
    ["Spring Boot", "spring-boot-maven"],
    ["React", "react"],
    ["Vue", "vue"],
    ["Express, Fastify, Koa", "express"],
    ["Next.js", "nextjs"],
    ["NestJS", "nestjs"],
    ["SvelteKit", "sveltekit"],
    ["Nuxt", "nuxt"],
    ["Gatsby", "gatsby"],
    ["Remix", "remix"],
    ["Vite", "vite"],
    ["Fiber", "fiber"],
    ["Django", "django"],
    ["Flask", "flask"],
    ["Laravel", "laravel"],
    ["Ruby on Rails", "rails"],
    [".NET", "dotnet"],
    ["AB Initio", "ab-initio"],
  ].map(([name, slug]) => ({
    name,
    path: `/integrations/frameworks/${slug}`,
    description: `Inject secrets into ${name} applications with Infisical.`,
    category: "Application Development",
  })),
  {
    name: "Gradle",
    path: "/integrations/build-tools/gradle",
    description: "Use Infisical secrets in Gradle builds.",
    category: "Application Development",
  },
  {
    name: "PM2",
    path: "/integrations/platforms/pm2",
    description: "Inject secrets into applications managed by PM2.",
    category: "Application Development",
  },
  {
    name: "Kubernetes Operator",
    path: "/integrations/platforms/kubernetes/overview",
    description: "Deliver secrets to Kubernetes workloads with the Infisical Operator.",
    category: "Kubernetes",
  },
  {
    name: "Kubernetes Operator Tutorial",
    path: "/documentation/guides/kubernetes-operator",
    description: "Follow an end-to-end tutorial for delivering secrets with the Kubernetes Operator.",
    category: "Kubernetes",
  },
  {
    name: "Kubernetes Injector",
    path: "/integrations/platforms/kubernetes-injector",
    description: "Inject secrets into Kubernetes pods as environment variables.",
    category: "Kubernetes",
  },
  {
    name: "Kubernetes CSI Provider",
    path: "/integrations/platforms/kubernetes-csi",
    description: "Mount Infisical secrets in Kubernetes with the Secrets Store CSI Driver.",
    category: "Kubernetes",
  },
  ...[
    ["Docker", "/integrations/platforms/docker"],
    ["Ansible", "/integrations/platforms/ansible"],
    ["Apache Airflow", "/integrations/platforms/apache-airflow"],
    ["AWS Lambda", "/integrations/platforms/aws/lambda"],
    ["Infisical Proxy", "/integrations/platforms/infisical-proxy"],
    ["Infisical Agent", "/integrations/platforms/infisical-agent"],
    ["Amazon ECS with Infisical Agent", "/integrations/platforms/ecs-with-agent"],
    ["Packer", "/integrations/frameworks/packer"],
    ["Pulumi", "/integrations/frameworks/pulumi"],
    ["Terraform", "/integrations/frameworks/terraform"],
  ].map(([name, path]) => ({
    name,
    path,
    description: `Deliver secrets to ${name} with Infisical.`,
    category: "Infrastructure",
  })),
  ...[
    ["AWS Amplify", "aws-amplify"],
    ["Bitbucket Pipelines", "bitbucket"],
    ["GitHub Actions", "githubactions"],
    ["GitLab CI/CD", "gitlab"],
    ["Jenkins", "jenkins"],
  ].map(([name, slug]) => ({
    name,
    path: `/integrations/cicd/${slug}`,
    description: `Use Infisical secrets in ${name} pipelines.`,
    category: "CI/CD",
  })),
  ...[
    ["1Password", "1password"],
    ["AWS Parameter Store", "aws-parameter-store"],
    ["AWS Secrets Manager", "aws-secrets-manager"],
    ["Azure App Configuration", "azure-app-configuration"],
    ["Azure DevOps", "azure-devops"],
    ["Azure Entra ID SCIM", "azure-entra-id-scim"],
    ["Azure Key Vault", "azure-key-vault"],
    ["Bitbucket", "bitbucket"],
    ["Camunda", "camunda"],
    ["Checkly", "checkly"],
    ["Chef", "chef"],
    ["CircleCI", "circleci"],
    ["Cloud 66", "cloud-66"],
    ["Cloudflare Pages", "cloudflare-pages"],
    ["Cloudflare Workers", "cloudflare-workers"],
    ["Databricks", "databricks"],
    ["Devin", "devin"],
    ["DigitalOcean App Platform", "digital-ocean-app-platform"],
    ["External Infisical", "external-infisical"],
    ["Fly.io", "flyio"],
    ["GCP Secret Manager", "gcp-secret-manager"],
    ["GitHub", "github"],
    ["GitLab", "gitlab"],
    ["HashiCorp Vault", "hashicorp-vault"],
    ["Hasura Cloud", "hasura-cloud"],
    ["Heroku", "heroku"],
    ["Humanitec", "humanitec"],
    ["Laravel Forge", "laravel-forge"],
    ["Netlify", "netlify"],
    ["Northflank", "northflank"],
    ["Octopus Deploy", "octopus-deploy"],
    ["OCI Vault", "oci-vault"],
    ["Ona", "ona"],
    ["OVH", "ovh"],
    ["Qovery", "qovery"],
    ["Railway", "railway"],
    ["Render", "render"],
    ["Rundeck", "rundeck"],
    ["Snowflake", "snowflake"],
    ["Spacelift", "spacelift"],
    ["Supabase", "supabase"],
    ["TeamCity", "teamcity"],
    ["Terraform Cloud", "terraform-cloud"],
    ["Travis CI", "travis-ci"],
    ["Trigger.dev", "trigger-dev"],
    ["Vercel", "vercel"],
    ["Windmill", "windmill"],
    ["Zabbix", "zabbix"],
  ].map(([name, slug]) => ({
    name,
    path: `/integrations/secret-syncs/${slug}`,
    description: `Sync secrets from Infisical to ${name}.`,
    category: "Secret Syncs",
  })),
  ...[
    ["Backstage", "/integrations/external/backstage"],
    ["Microsoft Power Apps", "/integrations/external/microsoft-power-apps"],
  ].map(([name, path]) => ({
    name,
    path,
    description: `Deliver secrets to ${name} with Infisical.`,
    category: "Other",
  })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const filteredEntries = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    return entries.filter((entry) => {
      const matchesCategory =
        selectedCategory === "All" || entry.category === selectedCategory;
      const matchesSearch =
        !normalizedSearchTerm ||
        entry.name.toLowerCase().includes(normalizedSearchTerm) ||
        entry.description.toLowerCase().includes(normalizedSearchTerm) ||
        entry.category.toLowerCase().includes(normalizedSearchTerm);

      return matchesCategory && matchesSearch;
    });
  }, [searchTerm, selectedCategory]);

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
        <label className="sr-only" htmlFor="delivery-integration-search">
          Search delivery integrations
        </label>
        <input
          id="delivery-integration-search"
          type="search"
          placeholder="Search delivery integrations..."
          className="block w-full border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-500 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:border-gray-700 dark:bg-black dark:text-gray-100 dark:placeholder-gray-400"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2" aria-label="Filter by category">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={selectedCategory === category}
            onClick={() => setSelectedCategory(category)}
            className={`border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
              selectedCategory === category
                ? "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                : "border-gray-200 bg-white text-gray-700 hover:border-yellow-200 hover:bg-yellow-50 dark:border-gray-700 dark:bg-black dark:text-gray-200 dark:hover:border-yellow-700 dark:hover:bg-yellow-950/20"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
        {filteredEntries.length} delivery option{filteredEntries.length === 1 ? "" : "s"} found
      </p>

      {filteredEntries.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredEntries.map((entry) => (
            <a
              key={`${entry.category}-${entry.path}`}
              href={entry.path}
              className="group block border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-yellow-200 hover:bg-yellow-50/50 focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:border-gray-700 dark:bg-black dark:hover:border-yellow-700 dark:hover:bg-yellow-950/20"
            >
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <h2 className="m-0 text-base font-medium leading-tight text-gray-900 dark:text-gray-100">
                  {entry.name}
                </h2>
                <span className="shrink-0 self-start border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  {entry.category}
                </span>
              </div>
              <p className="m-0 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {entry.description}
              </p>
            </a>
          ))}
        </div>
      ) : (
        <div className="border border-gray-200 py-8 text-center dark:border-gray-700">
          <p className="m-0 text-sm text-gray-500 dark:text-gray-400">
            No delivery options match your search and category.
          </p>
        </div>
      )}
    </div>
  );
};
