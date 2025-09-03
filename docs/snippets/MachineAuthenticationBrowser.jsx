import React, { useState, useMemo } from 'react';

export const MachineAuthenticationBrowser = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Token-based', 'Cloud Provider', 'Kubernetes', 'Certificate-based', 'Directory-based'];

  const authMethods = [
    {"name": "Universal Auth", "slug": "universal-auth", "path": "/documentation/platform/identities/universal-auth", "description": "Learn how to authenticate machines using Universal Auth tokens with client ID and secret.", "category": "Token-based"},
    {"name": "Token Auth", "slug": "token-auth", "path": "/documentation/platform/identities/token-auth", "description": "Learn how to authenticate machines using long-lived access tokens.", "category": "Token-based"},
    {"name": "JWT Auth", "slug": "jwt-auth", "path": "/documentation/platform/identities/jwt-auth", "description": "Learn how to authenticate machines using JSON Web Tokens (JWT).", "category": "Token-based"},
    {"name": "AWS Auth", "slug": "aws-iam-auth", "path": "/documentation/platform/identities/aws-auth", "description": "Learn how to authenticate AWS services and resources using IAM roles.", "category": "Cloud Provider"},
    {"name": "Azure Auth", "slug": "azure-auth", "path": "/documentation/platform/identities/azure-auth", "description": "Learn how to authenticate Azure services using managed identities.", "category": "Cloud Provider"},
    {"name": "GCP Auth", "slug": "gcp-auth", "path": "/documentation/platform/identities/gcp-auth", "description": "Learn how to authenticate GCP services using service accounts.", "category": "Cloud Provider"},
    {"name": "Alibaba Cloud Auth", "slug": "alicloud-auth", "path": "/documentation/platform/identities/alicloud-auth", "description": "Learn how to authenticate Alibaba Cloud services using RAM roles.", "category": "Cloud Provider"},
    {"name": "OCI Auth", "slug": "oci-auth", "path": "/documentation/platform/identities/oci-auth", "description": "Learn how to authenticate Oracle Cloud Infrastructure services.", "category": "Cloud Provider"},
    {"name": "Kubernetes Auth", "slug": "kubernetes-auth", "path": "/documentation/platform/identities/kubernetes-auth", "description": "Learn how to authenticate Kubernetes workloads using service account tokens.", "category": "Kubernetes"},
    {"name": "OIDC Auth", "slug": "oidc-auth-general", "path": "/documentation/platform/identities/oidc-auth/general", "description": "Learn how to authenticate machines using OpenID Connect (OIDC) providers.", "category": "Token-based"},
    {"name": "OIDC Auth for GitHub Actions", "slug": "oidc-auth-github", "path": "/documentation/platform/identities/oidc-auth/github", "description": "Learn how to authenticate GitHub Actions using OIDC.", "category": "Token-based"},
    {"name": "OIDC Auth for GitLab CI/CD", "slug": "oidc-auth-gitlab", "path": "/documentation/platform/identities/oidc-auth/gitlab", "description": "Learn how to authenticate GitLab CI/CD using OIDC.", "category": "Token-based"},
    {"name": "OIDC Auth for Azure", "slug": "oidc-auth-azure", "path": "/documentation/platform/identities/oidc-auth/azure", "description": "Learn how to authenticate Azure services using OIDC.", "category": "Token-based"},
    {"name": "OIDC Auth for CircleCI", "slug": "oidc-auth-circleci", "path": "/documentation/platform/identities/oidc-auth/circleci", "description": "Learn how to authenticate CircleCI workflows using OIDC.", "category": "Token-based"},
    {"name": "OIDC Auth for Terraform Cloud", "slug": "oidc-auth-terraform", "path": "/documentation/platform/identities/oidc-auth/terraform-cloud", "description": "Learn how to authenticate Terraform Cloud using OIDC.", "category": "Token-based"},
    {"name": "OIDC Auth for SPIRE", "slug": "oidc-auth-spire", "path": "/documentation/platform/identities/oidc-auth/spire", "description": "Learn how to authenticate workloads using SPIFFE/SPIRE OIDC.", "category": "Token-based"},
    {"name": "TLS Certificate Auth", "slug": "tls-cert-auth", "path": "/documentation/platform/identities/tls-cert-auth", "description": "Learn how to authenticate machines using TLS client certificates.", "category": "Certificate-based"},
    {"name": "LDAP Auth", "slug": "ldap-auth-general", "path": "/documentation/platform/identities/ldap-auth/general", "description": "Learn how to authenticate machines using LDAP credentials.", "category": "Directory-based"},
    {"name": "LDAP Auth for JumpCloud", "slug": "ldap-auth-jumpcloud", "path": "/documentation/platform/identities/ldap-auth/jumpcloud", "description": "Learn how to authenticate machines using JumpCloud LDAP.", "category": "Directory-based"}
  ].sort(function(a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  const filteredAuthMethods = useMemo(() => {
    let filtered = authMethods;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(method => method.category === selectedCategory);
    }

    if (searchTerm) {
      filtered = filtered.filter(method =>
        method.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        method.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        method.category.toLowerCase().includes(searchTerm.toLowerCase())
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
            placeholder="Search machine authentication methods..."
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
          {filteredAuthMethods.length} authentication method{filteredAuthMethods.length !== 1 ? 's' : ''} found
          {selectedCategory !== 'All' && ` in ${selectedCategory}`}
          {searchTerm && ` for "${searchTerm}"`}
        </p>
      </div>

      {/* Authentication Methods List */}
      {filteredAuthMethods.length > 0 ? (
        <div className="space-y-4">
          {filteredAuthMethods.map((method, index) => (
            <a
              key={method.slug}
              href={method.path}
              className="group block px-4 py-3 border border-gray-200 rounded-xl hover:border-yellow-200 hover:bg-yellow-50/50 hover:shadow-sm transition-all duration-200 bg-white shadow-sm"
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-base font-medium text-gray-900 leading-none m-0">
                    {method.name}
                  </h3>
                  <span className="ml-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 flex-shrink-0">
                    {method.category}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {method.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="flex flex-col items-center space-y-2">
            <p className="text-gray-500">No authentication methods found matching your criteria</p>
            {searchTerm && (
              <p className="text-gray-400 text-sm">Try adjusting your search terms or filters</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};