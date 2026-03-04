import React, { useState, useMemo } from 'react';

export const UserAuthenticationBrowser = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'SSO', 'LDAP', 'SCIM', 'General'];

  const authMethods = [
    {"name": "Auth0 OIDC", "slug": "auth0-oidc-sso", "path": "/documentation/platform/sso/auth0-oidc", "description": "Learn how to configure Auth0 OIDC SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Auth0 SAML", "slug": "auth0-saml-sso", "path": "/documentation/platform/sso/auth0-saml", "description": "Learn how to configure Auth0 SAML SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Entra ID / Azure AD SAML", "slug": "azure-ad-sso", "path": "/documentation/platform/sso/azure", "description": "Learn how to configure Azure Active Directory (Entra ID) SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Google", "slug": "google-sso", "path": "/documentation/platform/sso/google", "description": "Learn how to configure Google SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Google SAML", "slug": "google-saml-sso", "path": "/documentation/platform/sso/google-saml", "description": "Learn how to configure Google SAML SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "GitHub", "slug": "github-sso", "path": "/documentation/platform/sso/github", "description": "Learn how to configure GitHub SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "GitLab", "slug": "gitlab-sso", "path": "/documentation/platform/sso/gitlab", "description": "Learn how to configure GitLab SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "JumpCloud", "slug": "jumpcloud-sso", "path": "/documentation/platform/sso/jumpcloud", "description": "Learn how to configure JumpCloud SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Keycloak OIDC", "slug": "keycloak-oidc-sso", "path": "/documentation/platform/sso/keycloak-oidc/overview", "description": "Learn how to configure Keycloak OIDC SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Keycloak SAML", "slug": "keycloak-saml-sso", "path": "/documentation/platform/sso/keycloak-saml", "description": "Learn how to configure Keycloak SAML SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Okta OIDC", "slug": "okta-oidc-sso", "path": "/documentation/platform/sso/okta-oidc", "description": "Learn how to configure Okta OIDC SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Okta SAML", "slug": "okta-saml-sso", "path": "/documentation/platform/sso/okta", "description": "Learn how to configure Okta SAML SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "OneLogin SAML", "slug": "onelogin-saml-sso", "path": "/documentation/platform/sso/onelogin-saml", "description": "Learn how to configure OneLogin SAML SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "General OIDC", "slug": "general-oidc-sso", "path": "/documentation/platform/sso/general-oidc", "description": "Learn how to configure generic OIDC providers for SSO in Infisical.", "category": "SSO"},
    {"name": "General SAML 2.0", "slug": "general-saml-sso", "path": "/documentation/platform/sso/general-saml", "description": "Learn how to configure generic SAML 2.0 providers for SSO in Infisical.", "category": "SSO"},
    {"name": "LDAP", "slug": "ldap", "path": "/documentation/platform/ldap/overview", "description": "Learn how to configure LDAP authentication for user login in Infisical.", "category": "LDAP"},
    {"name": "SCIM", "slug": "scim", "path": "/documentation/platform/scim/overview", "description": "Learn how to configure SCIM provisioning for automated user management in Infisical.", "category": "SCIM"},
    {"name": "Email/Password", "slug": "email-password", "path": "/documentation/getting-started/introduction", "description": "Learn how to use standard email and password authentication in Infisical.", "category": "General"}
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
            placeholder="Search user authentication methods..."
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
          {filteredAuthMethods.length} user authentication method{filteredAuthMethods.length !== 1 ? 's' : ''} found
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
            <p className="text-gray-500">No user authentication methods found matching your criteria</p>
            {searchTerm && (
              <p className="text-gray-400 text-sm">Try adjusting your search terms or filters</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};