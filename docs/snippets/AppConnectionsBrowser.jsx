import React, { useState, useMemo } from "react";

export const AppConnectionsBrowser = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const categories = [
    "All",
    "Cloud Providers",
    "Databases",
    "CI/CD",
    "Monitoring",
    "Directory Services",
    "Identity & Auth",
    "Data Analytics",
    "Hosting",
    "DevOps Tools",
    "Security",
    "Networking & DNS",
  ];

  const connections = [
    {
      name: "AWS",
      slug: "aws",
      path: "/integrations/app-connections/aws",
      description:
        "Learn how to connect your AWS applications to pull secrets from Infisical.",
      category: "Cloud Providers",
    },
    {
      name: "Azure Key Vault",
      slug: "azure-key-vault",
      path: "/integrations/app-connections/azure-key-vault",
      description:
        "Learn how to connect your Azure Key Vault to pull secrets from Infisical.",
      category: "Cloud Providers",
    },
    {
      name: "Azure App Configuration",
      slug: "azure-app-configuration",
      path: "/integrations/app-connections/azure-app-configuration",
      description:
        "Learn how to connect your Azure App Configuration to pull secrets from Infisical.",
      category: "Cloud Providers",
    },
    {
      name: "Azure Client Secrets",
      slug: "azure-client-secrets",
      path: "/integrations/app-connections/azure-client-secrets",
      description:
        "Learn how to connect your Azure Client Secrets to pull secrets from Infisical.",
      category: "Cloud Providers",
    },
    {
      name: "Azure DevOps",
      slug: "azure-devops",
      path: "/integrations/app-connections/azure-devops",
      description:
        "Learn how to connect your Azure DevOps to pull secrets from Infisical.",
      category: "CI/CD",
    },
    {
      name: "Azure ADCS",
      slug: "azure-adcs",
      path: "/integrations/app-connections/azure-adcs",
      description:
        "Learn how to connect your Azure ADCS to pull secrets from Infisical.",
      category: "Cloud Providers",
    },
    {
      name: "GCP",
      slug: "gcp",
      path: "/integrations/app-connections/gcp",
      description:
        "Learn how to connect your GCP applications to pull secrets from Infisical.",
      category: "Cloud Providers",
    },
    {
      name: "HashiCorp Vault",
      slug: "hashicorp-vault",
      path: "/integrations/app-connections/hashicorp-vault",
      description:
        "Learn how to connect your HashiCorp Vault to pull secrets from Infisical.",
      category: "Security",
    },
    {
      name: "1Password",
      slug: "1password",
      path: "/integrations/app-connections/1password",
      description:
        "Learn how to connect your 1Password to pull secrets from Infisical.",
      category: "Security",
    },
    {
      name: "Vercel",
      slug: "vercel",
      path: "/integrations/app-connections/vercel",
      description:
        "Learn how to connect your Vercel application to pull secrets from Infisical.",
      category: "Hosting",
    },
    {
      name: "Netlify",
      slug: "netlify",
      path: "/integrations/app-connections/netlify",
      description:
        "Learn how to connect your Netlify application to pull secrets from Infisical.",
      category: "Hosting",
    },
    {
      name: "Railway",
      slug: "railway",
      path: "/integrations/app-connections/railway",
      description:
        "Learn how to connect your Railway application to pull secrets from Infisical.",
      category: "Hosting",
    },
    {
      name: "Fly.io",
      slug: "flyio",
      path: "/integrations/app-connections/flyio",
      description:
        "Learn how to connect your Fly.io application to pull secrets from Infisical.",
      category: "Hosting",
    },
    {
      name: "Render",
      slug: "render",
      path: "/integrations/app-connections/render",
      description:
        "Learn how to connect your Render application to pull secrets from Infisical.",
      category: "Hosting",
    },
    {
      name: "Heroku",
      slug: "heroku",
      path: "/integrations/app-connections/heroku",
      description:
        "Learn how to connect your Heroku application to pull secrets from Infisical.",
      category: "Hosting",
    },
    {
      name: "DigitalOcean",
      slug: "digital-ocean",
      path: "/integrations/app-connections/digital-ocean",
      description:
        "Learn how to connect your DigitalOcean application to pull secrets from Infisical.",
      category: "Hosting",
    },
    {
      name: "Supabase",
      slug: "supabase",
      path: "/integrations/app-connections/supabase",
      description:
        "Learn how to connect your Supabase application to pull secrets from Infisical.",
      category: "Databases",
    },
    {
      name: "Checkly",
      slug: "checkly",
      path: "/integrations/app-connections/checkly",
      description:
        "Learn how to connect your Checkly application to pull secrets from Infisical.",
      category: "Monitoring",
    },
    {
      name: "GitHub",
      slug: "github",
      path: "/integrations/app-connections/github",
      description:
        "Learn how to connect your GitHub application to pull secrets from Infisical.",
      category: "CI/CD",
    },
    {
      name: "GitHub Radar",
      slug: "github-radar",
      path: "/integrations/app-connections/github-radar",
      description:
        "Learn how to connect your GitHub Radar to pull secrets from Infisical.",
      category: "CI/CD",
    },
    {
      name: "GitLab",
      slug: "gitlab",
      path: "/integrations/app-connections/gitlab",
      description:
        "Learn how to connect your GitLab application to pull secrets from Infisical.",
      category: "CI/CD",
    },
    {
      name: "TeamCity",
      slug: "teamcity",
      path: "/integrations/app-connections/teamcity",
      description:
        "Learn how to connect your TeamCity to pull secrets from Infisical.",
      category: "CI/CD",
    },
    {
      name: "Bitbucket",
      slug: "bitbucket",
      path: "/integrations/app-connections/bitbucket",
      description:
        "Learn how to connect your Bitbucket to pull secrets from Infisical.",
      category: "CI/CD",
    },
    {
      name: "Terraform Cloud",
      slug: "terraform-cloud",
      path: "/integrations/app-connections/terraform-cloud",
      description:
        "Learn how to connect your Terraform Cloud to pull secrets from Infisical.",
      category: "DevOps Tools",
    },
    {
      name: "Cloudflare",
      slug: "cloudflare",
      path: "/integrations/app-connections/cloudflare",
      description:
        "Learn how to connect your Cloudflare application to pull secrets from Infisical.",
      category: "Cloud Providers",
    },
    {
      name: "Databricks",
      slug: "databricks",
      path: "/integrations/app-connections/databricks",
      description:
        "Learn how to connect your Databricks to pull secrets from Infisical.",
      category: "Data Analytics",
    },
    {
      name: "DNS Made Easy",
      slug: "dns-made-easy",
      path: "/integrations/app-connections/dns-made-easy",
      description: "Learn how to connect Infisical to DNS Made Easy.",
      category: "Networking & DNS",
    },
    {
      name: "Windmill",
      slug: "windmill",
      path: "/integrations/app-connections/windmill",
      description:
        "Learn how to connect your Windmill to pull secrets from Infisical.",
      category: "DevOps Tools",
    },
    {
      name: "Camunda",
      slug: "camunda",
      path: "/integrations/app-connections/camunda",
      description:
        "Learn how to connect your Camunda to pull secrets from Infisical.",
      category: "DevOps Tools",
    },
    {
      name: "Humanitec",
      slug: "humanitec",
      path: "/integrations/app-connections/humanitec",
      description:
        "Learn how to connect your Humanitec to pull secrets from Infisical.",
      category: "DevOps Tools",
    },
    {
      name: "OCI",
      slug: "oci",
      path: "/integrations/app-connections/oci",
      description:
        "Learn how to connect your OCI applications to pull secrets from Infisical.",
      category: "Cloud Providers",
    },
    {
      name: "Zabbix",
      slug: "zabbix",
      path: "/integrations/app-connections/zabbix",
      description:
        "Learn how to connect your Zabbix to pull secrets from Infisical.",
      category: "Monitoring",
    },
    {
      name: "MySQL",
      slug: "mysql",
      path: "/integrations/app-connections/mysql",
      description:
        "Learn how to connect your MySQL database to pull secrets from Infisical.",
      category: "Databases",
    },
    {
      name: "PostgreSQL",
      slug: "postgres",
      path: "/integrations/app-connections/postgres",
      description:
        "Learn how to connect your PostgreSQL database to pull secrets from Infisical.",
      category: "Databases",
    },
    {
      name: "Microsoft SQL Server",
      slug: "mssql",
      path: "/integrations/app-connections/mssql",
      description:
        "Learn how to connect your SQL Server database to pull secrets from Infisical.",
      category: "Databases",
    },
    {
      name: "Oracle Database",
      slug: "oracledb",
      path: "/integrations/app-connections/oracledb",
      description:
        "Learn how to connect your Oracle database to pull secrets from Infisical.",
      category: "Databases",
    },
    {
      name: "Redis",
      slug: "redis",
      path: "/integrations/app-connections/redis",
      description: "Learn how to connect Redis to pull secrets from Infisical.",
      category: "Databases",
    },
    {
      name: "LDAP",
      slug: "ldap",
      path: "/integrations/app-connections/ldap",
      description:
        "Learn how to connect your LDAP to pull secrets from Infisical.",
      category: "Directory Services",
    },
    {
      name: "Auth0",
      slug: "auth0",
      path: "/integrations/app-connections/auth0",
      description:
        "Learn how to connect your Auth0 to pull secrets from Infisical.",
      category: "Identity & Auth",
    },
    {
      name: "Okta",
      slug: "okta",
      path: "/integrations/app-connections/okta",
      description:
        "Learn how to connect your Okta to pull secrets from Infisical.",
      category: "Identity & Auth",
    },
    {
      name: "Laravel Forge",
      slug: "laravel-forge",
      path: "/integrations/app-connections/laravel-forge",
      description:
        "Learn how to connect your Laravel Forge to pull secrets from Infisical.",
      category: "Hosting",
    },
    {
      name: "Chef",
      slug: "chef",
      path: "/integrations/app-connections/chef",
      description:
        "Learn how to connect your Chef to pull secrets from Infisical.",
      category: "DevOps Tools",
    },
    {
      name: "Northflank",
      slug: "northflank",
      path: "/integrations/app-connections/northflank",
      description:
        "Learn how to connect your Northflank projects to pull secrets from Infisical.",
      category: "Hosting",
    },
    {
      name: "MongoDB",
      slug: "mongodb",
      path: "/integrations/app-connections/mongodb",
      description: "Learn how to connect your MongoDB to pull secrets from Infisical.",
      category: "Databases"
    },
    {
      name: "Octopus Deploy",
      slug: "octopus-deploy",
      path: "/integrations/app-connections/octopus-deploy",
      description: "Learn how to connect your Octopus Deploy to pull secrets from Infisical.",
      category: "DevOps Tools",
    }
  ].sort(function (a, b) {
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  const filteredConnections = useMemo(() => {
    let filtered = connections;

    if (selectedCategory !== "All") {
      filtered = filtered.filter(
        (connection) => connection.category === selectedCategory
      );
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (connection) =>
          connection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          connection.description
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          connection.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  }, [searchTerm, selectedCategory]);

  return (
    <div className="max-w-none">
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search app connections..."
            className="block w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Category Filter */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors shadow-sm ${
                selectedCategory === category
                  ? "bg-yellow-100 text-yellow-700 border border-yellow-200"
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-yellow-50 hover:border-yellow-200"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-4">
        <p className="text-sm text-gray-600">
          {filteredConnections.length} app connection
          {filteredConnections.length !== 1 ? "s" : ""} found
          {selectedCategory !== "All" && ` in ${selectedCategory}`}
          {searchTerm && ` for "${searchTerm}"`}
        </p>
      </div>

      {/* Connections List */}
      {filteredConnections.length > 0 ? (
        <div className="space-y-4">
          {filteredConnections.map((connection, index) => (
            <a
              key={connection.slug}
              href={connection.path}
              className="group block px-4 py-3 border border-gray-200 rounded-xl hover:border-yellow-200 hover:bg-yellow-50/50 hover:shadow-sm transition-all duration-200 bg-white shadow-sm"
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-base font-medium text-gray-900 leading-none m-0">
                    {connection.name}
                  </h3>
                  <span className="ml-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 flex-shrink-0">
                    {connection.category}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {connection.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="flex flex-col items-center space-y-2">
            <p className="text-gray-500">
              No app connections found matching your criteria
            </p>
            {searchTerm && (
              <p className="text-gray-400 text-sm">
                Try adjusting your search terms or filters
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
