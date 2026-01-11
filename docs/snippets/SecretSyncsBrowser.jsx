import React, { useState, useMemo } from 'react';

export const SecretSyncsBrowser = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Cloud Providers', 'Databases', 'CI/CD', 'Monitoring', 'Data Analytics', 'Hosting', 'DevOps Tools', 'Security'];

  const syncs = [
    {"name": "AWS Parameter Store", "slug": "aws-parameter-store", "path": "/integrations/secret-syncs/aws-parameter-store", "description": "Learn how to sync secrets from Infisical to AWS Parameter Store.", "category": "Cloud Providers"},
    {"name": "AWS Secrets Manager", "slug": "aws-secrets-manager", "path": "/integrations/secret-syncs/aws-secrets-manager", "description": "Learn how to sync secrets from Infisical to AWS Secrets Manager.", "category": "Cloud Providers"},
    {"name": "Azure Key Vault", "slug": "azure-key-vault", "path": "/integrations/secret-syncs/azure-key-vault", "description": "Learn how to sync secrets from Infisical to Azure Key Vault.", "category": "Cloud Providers"},
    {"name": "Azure App Configuration", "slug": "azure-app-configuration", "path": "/integrations/secret-syncs/azure-app-configuration", "description": "Learn how to sync secrets from Infisical to Azure App Configuration.", "category": "Cloud Providers"},
    {"name": "Azure DevOps", "slug": "azure-devops", "path": "/integrations/secret-syncs/azure-devops", "description": "Learn how to sync secrets from Infisical to Azure DevOps.", "category": "CI/CD"},
    {"name": "GCP Secret Manager", "slug": "gcp-secret-manager", "path": "/integrations/secret-syncs/gcp-secret-manager", "description": "Learn how to sync secrets from Infisical to GCP Secret Manager.", "category": "Cloud Providers"},
    {"name": "HashiCorp Vault", "slug": "hashicorp-vault", "path": "/integrations/secret-syncs/hashicorp-vault", "description": "Learn how to sync secrets from Infisical to HashiCorp Vault.", "category": "Security"},
    {"name": "1Password", "slug": "1password", "path": "/integrations/secret-syncs/1password", "description": "Learn how to sync secrets from Infisical to 1Password.", "category": "Security"},
    {"name": "Vercel", "slug": "vercel", "path": "/integrations/secret-syncs/vercel", "description": "Learn how to sync secrets from Infisical to Vercel.", "category": "Hosting"},
    {"name": "Netlify", "slug": "netlify", "path": "/integrations/secret-syncs/netlify", "description": "Learn how to sync secrets from Infisical to Netlify.", "category": "Hosting"},
    {"name": "Railway", "slug": "railway", "path": "/integrations/secret-syncs/railway", "description": "Learn how to sync secrets from Infisical to Railway.", "category": "Hosting"},
    {"name": "Fly.io", "slug": "flyio", "path": "/integrations/secret-syncs/flyio", "description": "Learn how to sync secrets from Infisical to Fly.io.", "category": "Hosting"},
    {"name": "Render", "slug": "render", "path": "/integrations/secret-syncs/render", "description": "Learn how to sync secrets from Infisical to Render.", "category": "Hosting"},
    {"name": "Heroku", "slug": "heroku", "path": "/integrations/secret-syncs/heroku", "description": "Learn how to sync secrets from Infisical to Heroku.", "category": "Hosting"},
    {"name": "DigitalOcean App Platform", "slug": "digital-ocean-app-platform", "path": "/integrations/secret-syncs/digital-ocean-app-platform", "description": "Learn how to sync secrets from Infisical to DigitalOcean App Platform.", "category": "Hosting"},
    {"name": "Supabase", "slug": "supabase", "path": "/integrations/secret-syncs/supabase", "description": "Learn how to sync secrets from Infisical to Supabase.", "category": "Databases"},
    {"name": "Checkly", "slug": "checkly", "path": "/integrations/secret-syncs/checkly", "description": "Learn how to sync secrets from Infisical to Checkly.", "category": "Monitoring"},
    {"name": "CircleCI", "slug": "circleci", "path": "/integrations/secret-syncs/circleci", "description": "Learn how to sync secrets from Infisical to CircleCI.", "category": "CI/CD"},
    {"name": "GitHub", "slug": "github", "path": "/integrations/secret-syncs/github", "description": "Learn how to sync secrets from Infisical to GitHub.", "category": "CI/CD"},
    {"name": "GitLab", "slug": "gitlab", "path": "/integrations/secret-syncs/gitlab", "description": "Learn how to sync secrets from Infisical to GitLab.", "category": "CI/CD"},
    {"name": "TeamCity", "slug": "teamcity", "path": "/integrations/secret-syncs/teamcity", "description": "Learn how to sync secrets from Infisical to TeamCity.", "category": "CI/CD"},
    {"name": "Bitbucket", "slug": "bitbucket", "path": "/integrations/secret-syncs/bitbucket", "description": "Learn how to sync secrets from Infisical to Bitbucket.", "category": "CI/CD"},
    {"name": "Terraform Cloud", "slug": "terraform-cloud", "path": "/integrations/secret-syncs/terraform-cloud", "description": "Learn how to sync secrets from Infisical to Terraform Cloud.", "category": "DevOps Tools"},
    {"name": "Cloudflare Pages", "slug": "cloudflare-pages", "path": "/integrations/secret-syncs/cloudflare-pages", "description": "Learn how to sync secrets from Infisical to Cloudflare Pages.", "category": "Hosting"},
    {"name": "Cloudflare Workers", "slug": "cloudflare-workers", "path": "/integrations/secret-syncs/cloudflare-workers", "description": "Learn how to sync secrets from Infisical to Cloudflare Workers.", "category": "Cloud Providers"},
    {"name": "Databricks", "slug": "databricks", "path": "/integrations/secret-syncs/databricks", "description": "Learn how to sync secrets from Infisical to Databricks.", "category": "Data Analytics"},
    {"name": "Windmill", "slug": "windmill", "path": "/integrations/secret-syncs/windmill", "description": "Learn how to sync secrets from Infisical to Windmill.", "category": "DevOps Tools"},
    {"name": "Camunda", "slug": "camunda", "path": "/integrations/secret-syncs/camunda", "description": "Learn how to sync secrets from Infisical to Camunda.", "category": "DevOps Tools"},
    {"name": "Humanitec", "slug": "humanitec", "path": "/integrations/secret-syncs/humanitec", "description": "Learn how to sync secrets from Infisical to Humanitec.", "category": "DevOps Tools"},
    {"name": "OCI Vault", "slug": "oci-vault", "path": "/integrations/secret-syncs/oci-vault", "description": "Learn how to sync secrets from Infisical to OCI Vault.", "category": "Cloud Providers"},
    {"name": "Zabbix", "slug": "zabbix", "path": "/integrations/secret-syncs/zabbix", "description": "Learn how to sync secrets from Infisical to Zabbix.", "category": "Monitoring"},
    {"name": "Laravel Forge", "slug": "laravel-forge", "path": "/integrations/secret-syncs/laravel-forge", "description": "Learn how to sync secrets from Infisical to Laravel Forge.", "category": "Hosting"},
    {"name": "Chef", "slug": "chef", "path": "/integrations/secret-syncs/chef", "description": "Learn how to sync secrets from Infisical to Chef.", "category": "DevOps Tools"},
    {"name": "Northflank", "slug": "northflank", "path": "/integrations/secret-syncs/northflank", "description": "Learn how to sync secrets from Infisical to Northflank projects.", "category": "Hosting"},
    {"name": "Octopus Deploy", "slug": "octopus-deploy", "path": "/integrations/secret-syncs/octopus-deploy", "description": "Learn how to sync secrets from Infisical to Octopus Deploy.", "category": "DevOps Tools"},
    { "name": "Coolify", "slug": "coolify", "path": "/integrations/secret-syncs/coolify", "description": "Learn how to sync secrets from Infisical to Coolify applications.", "category": "Hosting" }
  ].sort(function(a, b) {
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  const filteredSyncs = useMemo(() => {
    let filtered = syncs;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(sync => sync.category === selectedCategory);
    }

    if (searchTerm) {
      filtered = filtered.filter(sync =>
        sync.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sync.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sync.category.toLowerCase().includes(searchTerm.toLowerCase())
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
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search secret syncs..."
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
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors shadow-sm ${selectedCategory === category
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
          {filteredSyncs.length} secret sync{filteredSyncs.length !== 1 ? 's' : ''} found
          {selectedCategory !== 'All' && ` in ${selectedCategory}`}
          {searchTerm && ` for "${searchTerm}"`}
        </p>
      </div>

      {/* Secret Syncs List */}
      {filteredSyncs.length > 0 ? (
        <div className="space-y-4">
          {filteredSyncs.map((sync, index) => (
            <a
              key={sync.slug}
              href={sync.path}
              className="group block px-4 py-3 border border-gray-200 rounded-xl hover:border-yellow-200 hover:bg-yellow-50/50 hover:shadow-sm transition-all duration-200 bg-white shadow-sm"
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-base font-medium text-gray-900 leading-none m-0">
                    {sync.name}
                  </h3>
                  <span className="ml-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 flex-shrink-0">
                    {sync.category}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {sync.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="flex flex-col items-center space-y-2">
            <p className="text-gray-500">No secret syncs found matching your criteria</p>
            {searchTerm && (
              <p className="text-gray-400 text-sm">Try adjusting your search terms or filters</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
