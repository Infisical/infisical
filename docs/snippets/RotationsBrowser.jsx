import React, { useState, useMemo } from 'react';

export const RotationsBrowser = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Databases', 'Identity & Auth', 'Cloud Providers'];

  const rotations = [
    {"name": "AWS IAM User", "slug": "aws-iam-user", "path": "/documentation/platform/secret-rotation/aws-iam-user-secret", "description": "Learn how to automatically rotate AWS IAM user access keys.", "category": "Cloud Providers"},
    {"name": "Azure Client Secret", "slug": "azure-client-secret", "path": "/documentation/platform/secret-rotation/azure-client-secret", "description": "Learn how to automatically rotate Azure client secrets.", "category": "Cloud Providers"},
    {"name": "Auth0 Client Secret", "slug": "auth0-client-secret", "path": "/documentation/platform/secret-rotation/auth0-client-secret", "description": "Learn how to automatically rotate Auth0 client secrets.", "category": "Identity & Auth"},
    {"name": "Okta Client Secret", "slug": "okta-client-secret", "path": "/documentation/platform/secret-rotation/okta-client-secret", "description": "Learn how to automatically rotate Okta client secrets.", "category": "Identity & Auth"},
    {"name": "LDAP Password", "slug": "ldap-password", "path": "/documentation/platform/secret-rotation/ldap-password", "description": "Learn how to automatically rotate LDAP user passwords.", "category": "Identity & Auth"},
    {"name": "MySQL", "slug": "mysql-credentials", "path": "/documentation/platform/secret-rotation/mysql-credentials", "description": "Learn how to automatically rotate MySQL database credentials.", "category": "Databases"},
    {"name": "PostgreSQL", "slug": "postgres-credentials", "path": "/documentation/platform/secret-rotation/postgres-credentials", "description": "Learn how to automatically rotate PostgreSQL database credentials.", "category": "Databases"},
    {"name": "Redis", "slug": "redis-credentials", "path": "/documentation/platform/secret-rotation/redis-credentials", "description": "Learn how to automatically rotate Redis database credentials.", "category": "Databases"},
    {"name": "Microsoft SQL Server", "slug": "mssql-credentials", "path": "/documentation/platform/secret-rotation/mssql-credentials", "description": "Learn how to automatically rotate Microsoft SQL Server credentials.", "category": "Databases"},
    {"name": "Oracle Database", "slug": "oracledb-credentials", "path": "/documentation/platform/secret-rotation/oracledb-credentials", "description": "Learn how to automatically rotate Oracle Database credentials.", "category": "Databases"},
    {"name": "MongoDB Credentials", "slug": "mongodb-credentials", "path": "/documentation/platform/secret-rotation/mongodb-credentials", "description": "Learn how to automatically rotate MongoDB credentials.", "category": "Databases"}
  ].sort(function(a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  const filteredRotations = useMemo(() => {
    let filtered = rotations;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(rotation => rotation.category === selectedCategory);
    }

    if (searchTerm) {
      filtered = filtered.filter(rotation =>
        rotation.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rotation.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rotation.category.toLowerCase().includes(searchTerm.toLowerCase())
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
            placeholder="Search secret rotations..."
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
          {filteredRotations.length} secret rotation{filteredRotations.length !== 1 ? 's' : ''} found
          {selectedCategory !== 'All' && ` in ${selectedCategory}`}
          {searchTerm && ` for "${searchTerm}"`}
        </p>
      </div>

      {/* Rotations List */}
      {filteredRotations.length > 0 ? (
        <div className="space-y-4">
          {filteredRotations.map((rotation, index) => (
            <a
              key={rotation.slug}
              href={rotation.path}
              className="group block px-4 py-3 border border-gray-200 rounded-xl hover:border-yellow-200 hover:bg-yellow-50/50 hover:shadow-sm transition-all duration-200 bg-white shadow-sm"
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-base font-medium text-gray-900 leading-none m-0">
                    {rotation.name}
                  </h3>
                  <span className="ml-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 flex-shrink-0">
                    {rotation.category}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {rotation.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="flex flex-col items-center space-y-2">
            <p className="text-gray-500">No secret rotations found matching your criteria</p>
            {searchTerm && (
              <p className="text-gray-400 text-sm">Try adjusting your search terms or filters</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};