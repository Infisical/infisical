import React, { useState, useMemo } from 'react';

export const AppConnectionsBrowser = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Cloud Providers', 'Databases', 'CI/CD', 'Monitoring', 'Identity & Auth', 'Other'];

  const connections = [
    {"name": "1Password Connection", "slug": "1password", "path": "/integrations/app-connections/1password", "description": "Learn how to configure a 1Password Connection for Infisical.", "category": "Identity & Auth"},
    {"name": "Auth0 Connection", "slug": "auth0", "path": "/integrations/app-connections/auth0", "description": "Learn how to configure an Auth0 Connection for Infisical.", "category": "Identity & Auth"},
    {"name": "AWS Connection", "slug": "aws", "path": "/integrations/app-connections/aws", "description": "Learn how to configure an AWS Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Azure ADCS Connection", "slug": "azure-adcs", "path": "/integrations/app-connections/azure-adcs", "description": "Learn how to configure an Azure ADCS Connection for Infisical certificate management.", "category": "Cloud Providers"},
    {"name": "Azure App Configuration Connection", "slug": "azure-app-configuration", "path": "/integrations/app-connections/azure-app-configuration", "description": "Learn how to configure a Azure App Configuration Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Azure Client Secrets Connection", "slug": "azure-client-secrets", "path": "/integrations/app-connections/azure-client-secrets", "description": "Learn how to configure an Azure Client Secrets Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Azure DevOps Connection", "slug": "azure-devops", "path": "/integrations/app-connections/azure-devops", "description": "Learn how to configure an Azure DevOps Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Azure Key Vault Connection", "slug": "azure-key-vault", "path": "/integrations/app-connections/azure-key-vault", "description": "Learn how to configure a Azure Key Vault Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Bitbucket Connection", "slug": "bitbucket", "path": "/integrations/app-connections/bitbucket", "description": "Learn how to configure a Bitbucket Connection for Infisical.", "category": "CI/CD"},
    {"name": "Camunda Connection", "slug": "camunda", "path": "/integrations/app-connections/camunda", "description": "Learn how to configure a Camunda Connection for Infisical.", "category": "Other"},
    {"name": "Checkly Connection", "slug": "checkly", "path": "/integrations/app-connections/checkly", "description": "Learn how to configure a Checkly Connection for Infisical.", "category": "Monitoring"},
    {"name": "Cloudflare Connection", "slug": "cloudflare", "path": "/integrations/app-connections/cloudflare", "description": "Learn how to configure a Cloudflare Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Databricks Connection", "slug": "databricks", "path": "/integrations/app-connections/databricks", "description": "Learn how to configure a Databricks Connection for Infisical.", "category": "Monitoring"},
    {"name": "DigitalOcean Connection", "slug": "digital-ocean", "path": "/integrations/app-connections/digital-ocean", "description": "Learn how to configure a DigitalOcean Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Fly.io Connection", "slug": "flyio", "path": "/integrations/app-connections/flyio", "description": "Learn how to configure a Fly.io Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "GCP Connection", "slug": "gcp", "path": "/integrations/app-connections/gcp", "description": "Learn how to configure a GCP Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "GitHub Radar Connection", "slug": "github-radar", "path": "/integrations/app-connections/github-radar", "description": "Learn how to configure a GitHub Radar Connection for Infisical.", "category": "CI/CD"},
    {"name": "GitHub Connection", "slug": "github", "path": "/integrations/app-connections/github", "description": "Learn how to configure a GitHub Connection for Infisical.", "category": "CI/CD"},
    {"name": "GitLab Connection", "slug": "gitlab", "path": "/integrations/app-connections/gitlab", "description": "Learn how to configure a GitLab Connection for Infisical using OAuth or Access Token methods.", "category": "CI/CD"},
    {"name": "Hashicorp Vault Connection", "slug": "hashicorp-vault", "path": "/integrations/app-connections/hashicorp-vault", "description": "Learn how to configure a Hashicorp Vault Connection for Infisical.", "category": "Other"},
    {"name": "Heroku Connection", "slug": "heroku", "path": "/integrations/app-connections/heroku", "description": "Learn how to configure a Heroku Connection for Infisical using OAuth or Auth Token methods.", "category": "Cloud Providers"},
    {"name": "Humanitec Connection", "slug": "humanitec", "path": "/integrations/app-connections/humanitec", "description": "Learn how to configure a Humanitec Connection for Infisical.", "category": "Other"},
    {"name": "LDAP Connection", "slug": "ldap", "path": "/integrations/app-connections/ldap", "description": "Learn how to configure an LDAP Connection for Infisical.", "category": "Identity & Auth"},
    {"name": "Microsoft SQL Server Connection", "slug": "mssql", "path": "/integrations/app-connections/mssql", "description": "Learn how to configure a Microsoft SQL Server Connection for Infisical.", "category": "Databases"},
    {"name": "MySQL Connection", "slug": "mysql", "path": "/integrations/app-connections/mysql", "description": "Learn how to configure a MySQL Connection for Infisical.", "category": "Databases"},
    {"name": "Netlify Connection", "slug": "netlify", "path": "/integrations/app-connections/netlify", "description": "Learn how to configure a Netlify Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "OCI Connection", "slug": "oci", "path": "/integrations/app-connections/oci", "description": "Learn how to configure an Oracle Cloud Infrastructure Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Okta Connection", "slug": "okta", "path": "/integrations/app-connections/okta", "description": "Learn how to configure an Okta Connection for Infisical.", "category": "Identity & Auth"},
    {"name": "OracleDB Connection", "slug": "oracledb", "path": "/integrations/app-connections/oracledb", "description": "Learn how to configure a Oracle Database Connection for Infisical.", "category": "Databases"},
    {"name": "PostgreSQL Connection", "slug": "postgres", "path": "/integrations/app-connections/postgres", "description": "Learn how to configure a PostgreSQL Connection for Infisical.", "category": "Databases"},
    {"name": "Railway Connection", "slug": "railway", "path": "/integrations/app-connections/railway", "description": "Learn how to configure a Railway Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Render Connection", "slug": "render", "path": "/integrations/app-connections/render", "description": "Learn how to configure a Render Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Supabase Connection", "slug": "supabase", "path": "/integrations/app-connections/supabase", "description": "Learn how to configure a Supabase Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "TeamCity Connection", "slug": "teamcity", "path": "/integrations/app-connections/teamcity", "description": "Learn how to configure a TeamCity Connection for Infisical.", "category": "CI/CD"},
    {"name": "Terraform Cloud Connection", "slug": "terraform-cloud", "path": "/integrations/app-connections/terraform-cloud", "description": "Learn how to configure a Terraform Cloud Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Vercel Connection", "slug": "vercel", "path": "/integrations/app-connections/vercel", "description": "Learn how to configure a Vercel Connection for Infisical.", "category": "Cloud Providers"},
    {"name": "Windmill Connection", "slug": "windmill", "path": "/integrations/app-connections/windmill", "description": "Learn how to configure a Windmill Connection for Infisical.", "category": "Other"},
    {"name": "Zabbix Connection", "slug": "zabbix", "path": "/integrations/app-connections/zabbix", "description": "Learn how to configure a Zabbix Connection for Infisical.", "category": "Monitoring"}
  ];

  const filteredConnections = useMemo(() => {
    let filtered = connections;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(connection => connection.category === selectedCategory);
    }

    if (searchTerm) {
      filtered = filtered.filter(connection =>
        connection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        connection.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        connection.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  }, [connections, searchTerm, selectedCategory]);

  return (
    <div className="max-w-none">
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors shadow-sm ${
                selectedCategory === category
                  ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-yellow-50 hover:border-yellow-200'
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
          {filteredConnections.length} app connection{filteredConnections.length !== 1 ? 's' : ''} found
          {selectedCategory !== 'All' && ` in ${selectedCategory}`}
          {searchTerm && ` for "${searchTerm}"`}
        </p>
      </div>

      {/* Connections List */}
      {filteredConnections.length > 0 ? (
        <div className="space-y-4">
          {filteredConnections.map((connection, index) => (
            <a
              key={`${connection.slug}-${index}`}
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
      ) : null}
    </div>
  );
};