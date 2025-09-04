import React, { useState, useMemo } from 'react';

export const DynamicSecretsBrowser = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Databases', 'Cloud Providers', 'Message Queues', 'Caches', 'Directory Services', 'CI/CD', 'Container Orchestration', 'Authentication'];

  const dynamicSecrets = [
    {"name": "AWS IAM", "slug": "aws-iam", "path": "/documentation/platform/dynamic-secrets/aws-iam", "description": "Learn how to generate dynamic AWS IAM credentials on-demand.", "category": "Cloud Providers"},
    {"name": "AWS ElastiCache", "slug": "aws-elasticache", "path": "/documentation/platform/dynamic-secrets/aws-elasticache", "description": "Learn how to generate dynamic AWS ElastiCache credentials on-demand.", "category": "Caches"},
    {"name": "Azure Entra ID", "slug": "azure-entra-id", "path": "/documentation/platform/dynamic-secrets/azure-entra-id", "description": "Learn how to generate dynamic Azure Entra ID credentials on-demand.", "category": "Cloud Providers"},
    {"name": "GCP IAM", "slug": "gcp-iam", "path": "/documentation/platform/dynamic-secrets/gcp-iam", "description": "Learn how to generate dynamic GCP IAM credentials on-demand.", "category": "Cloud Providers"},
    {"name": "Cassandra", "slug": "cassandra", "path": "/documentation/platform/dynamic-secrets/cassandra", "description": "Learn how to generate dynamic Cassandra database credentials on-demand.", "category": "Databases"},
    {"name": "Couchbase", "slug": "couchbase", "path": "/documentation/platform/dynamic-secrets/couchbase", "description": "Learn how to generate dynamic Couchbase database credentials on-demand.", "category": "Databases"},
    {"name": "MongoDB", "slug": "mongodb", "path": "/documentation/platform/dynamic-secrets/mongo-db", "description": "Learn how to generate dynamic MongoDB database credentials on-demand.", "category": "Databases"},
    {"name": "MongoDB Atlas", "slug": "mongodb-atlas", "path": "/documentation/platform/dynamic-secrets/mongo-atlas", "description": "Learn how to generate dynamic MongoDB Atlas database credentials on-demand.", "category": "Databases"},
    {"name": "MySQL", "slug": "mysql", "path": "/documentation/platform/dynamic-secrets/mysql", "description": "Learn how to generate dynamic MySQL database credentials on-demand.", "category": "Databases"},
    {"name": "PostgreSQL", "slug": "postgresql", "path": "/documentation/platform/dynamic-secrets/postgresql", "description": "Learn how to generate dynamic PostgreSQL database credentials on-demand.", "category": "Databases"},
    {"name": "Microsoft SQL Server", "slug": "mssql", "path": "/documentation/platform/dynamic-secrets/mssql", "description": "Learn how to generate dynamic Microsoft SQL Server credentials on-demand.", "category": "Databases"},
    {"name": "Oracle Database", "slug": "oracle", "path": "/documentation/platform/dynamic-secrets/oracle", "description": "Learn how to generate dynamic Oracle Database credentials on-demand.", "category": "Databases"},
    {"name": "SAP ASE", "slug": "sap-ase", "path": "/documentation/platform/dynamic-secrets/sap-ase", "description": "Learn how to generate dynamic SAP ASE database credentials on-demand.", "category": "Databases"},
    {"name": "SAP HANA", "slug": "sap-hana", "path": "/documentation/platform/dynamic-secrets/sap-hana", "description": "Learn how to generate dynamic SAP HANA database credentials on-demand.", "category": "Databases"},
    {"name": "Snowflake", "slug": "snowflake", "path": "/documentation/platform/dynamic-secrets/snowflake", "description": "Learn how to generate dynamic Snowflake database credentials on-demand.", "category": "Databases"},
    {"name": "Vertica", "slug": "vertica", "path": "/documentation/platform/dynamic-secrets/vertica", "description": "Learn how to generate dynamic Vertica database credentials on-demand.", "category": "Databases"},
    {"name": "Redis", "slug": "redis", "path": "/documentation/platform/dynamic-secrets/redis", "description": "Learn how to generate dynamic Redis credentials on-demand.", "category": "Caches"},
    {"name": "ElasticSearch", "slug": "elasticsearch", "path": "/documentation/platform/dynamic-secrets/elastic-search", "description": "Learn how to generate dynamic ElasticSearch credentials on-demand.", "category": "Databases"},
    {"name": "RabbitMQ", "slug": "rabbitmq", "path": "/documentation/platform/dynamic-secrets/rabbit-mq", "description": "Learn how to generate dynamic RabbitMQ credentials on-demand.", "category": "Message Queues"},
    {"name": "LDAP", "slug": "ldap", "path": "/documentation/platform/dynamic-secrets/ldap", "description": "Learn how to generate dynamic LDAP credentials on-demand.", "category": "Directory Services"},
    {"name": "GitHub", "slug": "github", "path": "/documentation/platform/dynamic-secrets/github", "description": "Learn how to generate dynamic GitHub credentials on-demand.", "category": "CI/CD"},
    {"name": "Kubernetes", "slug": "kubernetes", "path": "/documentation/platform/dynamic-secrets/kubernetes", "description": "Learn how to generate dynamic Kubernetes credentials on-demand.", "category": "Container Orchestration"},
    {"name": "TOTP", "slug": "totp", "path": "/documentation/platform/dynamic-secrets/totp", "description": "Learn how to generate dynamic TOTP codes on-demand.", "category": "Authentication"}
  ].sort(function(a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  const filteredDynamicSecrets = useMemo(() => {
    let filtered = dynamicSecrets;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(secret => secret.category === selectedCategory);
    }

    if (searchTerm) {
      filtered = filtered.filter(secret =>
        secret.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        secret.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        secret.category.toLowerCase().includes(searchTerm.toLowerCase())
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
            placeholder="Search dynamic secrets..."
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
          {filteredDynamicSecrets.length} dynamic secret{filteredDynamicSecrets.length !== 1 ? 's' : ''} found
          {selectedCategory !== 'All' && ` in ${selectedCategory}`}
          {searchTerm && ` for "${searchTerm}"`}
        </p>
      </div>

      {/* Dynamic Secrets List */}
      {filteredDynamicSecrets.length > 0 ? (
        <div className="space-y-4">
          {filteredDynamicSecrets.map((secret, index) => (
            <a
              key={secret.slug}
              href={secret.path}
              className="group block px-4 py-3 border border-gray-200 rounded-xl hover:border-yellow-200 hover:bg-yellow-50/50 hover:shadow-sm transition-all duration-200 bg-white shadow-sm"
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-base font-medium text-gray-900 leading-none m-0">
                    {secret.name}
                  </h3>
                  <span className="ml-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 flex-shrink-0">
                    {secret.category}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {secret.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="flex flex-col items-center space-y-2">
            <p className="text-gray-500">No dynamic secrets found matching your criteria</p>
            {searchTerm && (
              <p className="text-gray-400 text-sm">Try adjusting your search terms or filters</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};