import React, { useState, useMemo } from 'react';

export const UserAuthenticationBrowser = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'SSO', 'LDAP', 'SCIM', 'General'];

  const authMethods = [
    {"name": "Auth0 OIDC SSO", "slug": "auth0-oidc-sso", "path": "/documentation/platform/sso/auth0-oidc", "description": "Learn how to configure Auth0 OIDC SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Auth0 SAML SSO", "slug": "auth0-saml-sso", "path": "/documentation/platform/sso/auth0-saml", "description": "Learn how to configure Auth0 SAML SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Azure AD SSO", "slug": "azure-ad-sso", "path": "/documentation/platform/sso/azure", "description": "Learn how to configure Azure Active Directory SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Google SSO", "slug": "google-sso", "path": "/documentation/platform/sso/google", "description": "Learn how to configure Google SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Google SAML SSO", "slug": "google-saml-sso", "path": "/documentation/platform/sso/google-saml", "description": "Learn how to configure Google SAML SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "GitHub SSO", "slug": "github-sso", "path": "/documentation/platform/sso/github", "description": "Learn how to configure GitHub SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "GitLab SSO", "slug": "gitlab-sso", "path": "/documentation/platform/sso/gitlab", "description": "Learn how to configure GitLab SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "JumpCloud SSO", "slug": "jumpcloud-sso", "path": "/documentation/platform/sso/jumpcloud", "description": "Learn how to configure JumpCloud SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Keycloak OIDC SSO", "slug": "keycloak-oidc-sso", "path": "/documentation/platform/sso/keycloak-oidc/overview", "description": "Learn how to configure Keycloak OIDC SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Keycloak SAML SSO", "slug": "keycloak-saml-sso", "path": "/documentation/platform/sso/keycloak-saml", "description": "Learn how to configure Keycloak SAML SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "Okta SSO", "slug": "okta-sso", "path": "/documentation/platform/sso/okta", "description": "Learn how to configure Okta SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "General OIDC SSO", "slug": "general-oidc-sso", "path": "/documentation/platform/sso/general-oidc/overview", "description": "Learn how to configure general OIDC SSO for user authentication in Infisical.", "category": "SSO"},
    {"name": "JumpCloud LDAP", "slug": "jumpcloud-ldap", "path": "/documentation/platform/ldap/jumpcloud", "description": "Learn how to configure JumpCloud LDAP for user authentication in Infisical.", "category": "LDAP"},
    {"name": "General LDAP", "slug": "general-ldap", "path": "/documentation/platform/ldap/general", "description": "Learn how to configure general LDAP for user authentication in Infisical.", "category": "LDAP"},
    {"name": "JumpCloud SCIM", "slug": "jumpcloud-scim", "path": "/documentation/platform/scim/jumpcloud", "description": "Learn how to configure JumpCloud SCIM for user provisioning in Infisical.", "category": "SCIM"},
    {"name": "Okta SCIM", "slug": "okta-scim", "path": "/documentation/platform/scim/okta", "description": "Learn how to configure Okta SCIM for user provisioning in Infisical.", "category": "SCIM"},
    {"name": "Azure SCIM", "slug": "azure-scim", "path": "/documentation/platform/scim/azure", "description": "Learn how to configure Azure SCIM for user provisioning in Infisical.", "category": "SCIM"},
    {"name": "Email & Password", "slug": "email-password", "path": "/documentation/platform/auth-methods/email-password", "description": "Learn about email and password authentication for users in Infisical.", "category": "General"}
  ];

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
            placeholder="Search authentication methods..."
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

      {/* Auth Methods List */}
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
        <div className="text-center py-12">
          <p className="text-gray-500 text-base">No authentication methods found matching your criteria.</p>
          <p className="text-gray-400 text-sm mt-2">Try adjusting your search terms or category filter.</p>
        </div>
      )}
    </div>
  );
};