import React, { useState, useMemo } from 'react';

export const SecretSyncsBrowser = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Cloud Providers', 'CI/CD', 'Databases', 'Identity & Auth', 'Other'];

  const syncs = [
    {"name": "AWS Parameter Store", "slug": "aws-parameter-store", "path": "/integrations/cloud/aws-parameter-store", "description": "Learn how to sync secrets from Infisical to AWS Parameter Store.", "category": "Cloud Providers"},
    {"name": "AWS Secrets Manager", "slug": "aws-secrets-manager", "path": "/integrations/cloud/aws-secrets-manager", "description": "Learn how to sync secrets from Infisical to AWS Secrets Manager.", "category": "Cloud Providers"},
    {"name": "Azure Key Vault", "slug": "azure-key-vault", "path": "/integrations/cloud/azure-key-vault", "description": "Learn how to sync secrets from Infisical to Azure Key Vault.", "category": "Cloud Providers"},
    {"name": "Bitbucket", "slug": "bitbucket", "path": "/integrations/cicd/bitbucket", "description": "Learn how to sync secrets from Infisical to Bitbucket.", "category": "CI/CD"},
    {"name": "Checkly", "slug": "checkly", "path": "/integrations/cloud/checkly", "description": "Learn how to sync secrets from Infisical to Checkly.", "category": "Other"},
    {"name": "CircleCI", "slug": "circleci", "path": "/integrations/cicd/circleci", "description": "Learn how to sync secrets from Infisical to CircleCI.", "category": "CI/CD"},
    {"name": "Cloudflare Pages", "slug": "cloudflare-pages", "path": "/integrations/cloud/cloudflare-pages", "description": "Learn how to sync secrets from Infisical to Cloudflare Pages.", "category": "Cloud Providers"},
    {"name": "Cloudflare Workers", "slug": "cloudflare-workers", "path": "/integrations/cloud/cloudflare-workers", "description": "Learn how to sync secrets from Infisical to Cloudflare Workers.", "category": "Cloud Providers"},
    {"name": "Databricks", "slug": "databricks", "path": "/integrations/cloud/databricks", "description": "Learn how to sync secrets from Infisical to Databricks.", "category": "Other"},
    {"name": "DigitalOcean App Platform", "slug": "digital-ocean-app-platform", "path": "/integrations/cloud/digital-ocean-app-platform", "description": "Learn how to sync secrets from Infisical to DigitalOcean App Platform.", "category": "Cloud Providers"},
    {"name": "Docker", "slug": "docker", "path": "/integrations/platforms/docker", "description": "Learn how to sync secrets from Infisical to Docker.", "category": "Other"},
    {"name": "Docker Compose", "slug": "docker-compose", "path": "/integrations/platforms/docker-compose", "description": "Learn how to sync secrets from Infisical to Docker Compose.", "category": "Other"},
    {"name": "Fly.io", "slug": "flyio", "path": "/integrations/cloud/flyio", "description": "Learn how to sync secrets from Infisical to Fly.io.", "category": "Cloud Providers"},
    {"name": "GCP Secret Manager", "slug": "gcp-secret-manager", "path": "/integrations/cloud/gcp-secret-manager", "description": "Learn how to sync secrets from Infisical to GCP Secret Manager.", "category": "Cloud Providers"},
    {"name": "GitHub Actions", "slug": "github-actions", "path": "/integrations/cicd/githubactions", "description": "Learn how to sync secrets from Infisical to GitHub Actions.", "category": "CI/CD"},
    {"name": "GitLab CI/CD", "slug": "gitlab-cicd", "path": "/integrations/cicd/gitlab", "description": "Learn how to sync secrets from Infisical to GitLab CI/CD.", "category": "CI/CD"},
    {"name": "HashiCorp Vault", "slug": "hashicorp-vault", "path": "/integrations/cloud/hashicorp-vault", "description": "Learn how to sync secrets from Infisical to HashiCorp Vault.", "category": "Other"},
    {"name": "Heroku", "slug": "heroku", "path": "/integrations/cloud/heroku", "description": "Learn how to sync secrets from Infisical to Heroku.", "category": "Cloud Providers"},
    {"name": "Laravel Forge", "slug": "laravel-forge", "path": "/integrations/cloud/laravel-forge", "description": "Learn how to sync secrets from Infisical to Laravel Forge.", "category": "Other"},
    {"name": "Netlify", "slug": "netlify", "path": "/integrations/cloud/netlify", "description": "Learn how to sync secrets from Infisical to Netlify.", "category": "Cloud Providers"},
    {"name": "Northflank", "slug": "northflank", "path": "/integrations/cloud/northflank", "description": "Learn how to sync secrets from Infisical to Northflank.", "category": "Cloud Providers"},
    {"name": "Railway", "slug": "railway", "path": "/integrations/cloud/railway", "description": "Learn how to sync secrets from Infisical to Railway.", "category": "Cloud Providers"},
    {"name": "Render", "slug": "render", "path": "/integrations/cloud/render", "description": "Learn how to sync secrets from Infisical to Render.", "category": "Cloud Providers"},
    {"name": "Supabase", "slug": "supabase", "path": "/integrations/cloud/supabase", "description": "Learn how to sync secrets from Infisical to Supabase.", "category": "Cloud Providers"},
    {"name": "TeamCity", "slug": "teamcity", "path": "/integrations/cicd/teamcity", "description": "Learn how to sync secrets from Infisical to TeamCity.", "category": "CI/CD"},
    {"name": "Terraform Cloud", "slug": "terraform-cloud", "path": "/integrations/cloud/terraform-cloud", "description": "Learn how to sync secrets from Infisical to Terraform Cloud.", "category": "Other"},
    {"name": "Vercel", "slug": "vercel", "path": "/integrations/cloud/vercel", "description": "Learn how to sync secrets from Infisical to Vercel.", "category": "Cloud Providers"},
    {"name": "Windmill", "slug": "windmill", "path": "/integrations/cloud/windmill", "description": "Learn how to sync secrets from Infisical to Windmill.", "category": "Other"}
  ];

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
          {filteredSyncs.length} secret sync{filteredSyncs.length !== 1 ? 's' : ''} found
          {selectedCategory !== 'All' && ` in ${selectedCategory}`}
          {searchTerm && ` for "${searchTerm}"`}
        </p>
      </div>

      {/* Syncs List */}
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
          <p className="text-gray-500">No secret syncs found matching your criteria.</p>
          {searchTerm && (
            <p className="text-gray-400 text-sm mt-2">Try adjusting your search terms or category filter.</p>
          )}
        </div>
      )}
    </div>
  );
};