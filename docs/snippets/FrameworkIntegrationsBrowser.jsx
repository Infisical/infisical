import React, { useState, useMemo } from 'react';

export const FrameworkIntegrationsBrowser = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const integrations = [
    {"name": "React", "slug": "react", "path": "/integrations/frameworks/react", "description": "Learn how to integrate Infisical with React applications for secure secret management.", "category": "Web Frameworks"},
    {"name": "Next.js", "slug": "nextjs", "path": "/integrations/frameworks/nextjs", "description": "Learn how to integrate Infisical with Next.js applications.", "category": "Web Frameworks"},
    {"name": "Vue", "slug": "vuejs", "path": "/integrations/frameworks/vue", "description": "Learn how to integrate Infisical with Vue.js applications.", "category": "Web Frameworks"},
    {"name": "Nuxt", "slug": "nuxtjs", "path": "/integrations/frameworks/nuxt", "description": "Learn how to integrate Infisical with Nuxt.js applications.", "category": "Web Frameworks"},
    {"name": "SvelteKit", "slug": "sveltekit", "path": "/integrations/frameworks/sveltekit", "description": "Learn how to integrate Infisical with SvelteKit applications.", "category": "Web Frameworks"},
    {"name": "Express, Fastify, Koa", "slug": "express", "path": "/integrations/frameworks/express", "description": "Learn how to integrate Infisical with Express.js backend applications.", "category": "Web Frameworks"},
    {"name": "NestJS", "slug": "nestjs", "path": "/integrations/frameworks/nestjs", "description": "Learn how to integrate Infisical with NestJS applications.", "category": "Web Frameworks"},
    {"name": "Django", "slug": "django", "path": "/integrations/frameworks/django", "description": "Learn how to integrate Infisical with Django applications.", "category": "Web Frameworks"},
    {"name": "Flask", "slug": "flask", "path": "/integrations/frameworks/flask", "description": "Learn how to integrate Infisical with Flask applications.", "category": "Web Frameworks"},
    {"name": "Ruby on Rails", "slug": "rails", "path": "/integrations/frameworks/rails", "description": "Learn how to integrate Infisical with Ruby on Rails applications.", "category": "Web Frameworks"},
    {"name": "Spring Boot", "slug": "spring-boot-maven", "path": "/integrations/frameworks/spring-boot-maven", "description": "Learn how to integrate Infisical with Spring Boot applications.", "category": "Web Frameworks"},
    {"name": "Laravel", "slug": "laravel", "path": "/integrations/frameworks/laravel", "description": "Learn how to integrate Infisical with Laravel applications.", "category": "Web Frameworks"},
    {"name": ".NET", "slug": "dotnet", "path": "/integrations/frameworks/dotnet", "description": "Learn how to integrate Infisical with .NET applications.", "category": "Web Frameworks"},
    {"name": "Fiber", "slug": "fiber", "path": "/integrations/frameworks/fiber", "description": "Learn how to integrate Infisical with Fiber (Go) framework.", "category": "Web Frameworks"},
    {"name": "Gatsby", "slug": "gatsby", "path": "/integrations/frameworks/gatsby", "description": "Learn how to integrate Infisical with Gatsby applications.", "category": "Web Frameworks"},
    {"name": "Remix", "slug": "remix", "path": "/integrations/frameworks/remix", "description": "Learn how to integrate Infisical with Remix applications.", "category": "Web Frameworks"},
    {"name": "Vite", "slug": "vite", "path": "/integrations/frameworks/vite", "description": "Learn how to integrate Infisical with Vite applications.", "category": "Web Frameworks"},
    {"name": "AB Initio", "slug": "ab-initio", "path": "/integrations/frameworks/ab-initio", "description": "Learn how to integrate Infisical with AB Initio applications.", "category": "Web Frameworks"}
  ].sort(function(a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  const filteredIntegrations = useMemo(() => {
    if (searchTerm) {
      return integrations.filter(integration =>
        integration.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        integration.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return integrations;
  }, [searchTerm]);

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
            placeholder="Search framework integrations..."
            className="block w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-4">
        <p className="text-sm text-gray-600">
          {filteredIntegrations.length} framework integration{filteredIntegrations.length !== 1 ? 's' : ''} found
          {searchTerm && ` for "${searchTerm}"`}
        </p>
      </div>

      {/* Integrations List */}
      {filteredIntegrations.length > 0 ? (
        <div className="space-y-4">
          {filteredIntegrations.map((integration, index) => (
            <a
              key={integration.slug}
              href={integration.path}
              className="group block px-4 py-3 border border-gray-200 rounded-xl hover:border-yellow-200 hover:bg-yellow-50/50 hover:shadow-sm transition-all duration-200 bg-white shadow-sm"
            >
              <div className="w-full">
                <div className="mb-0.5">
                  <h3 className="text-base font-medium text-gray-900 leading-none m-0">
                    {integration.name}
                  </h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {integration.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="flex flex-col items-center space-y-2">
            <p className="text-gray-500">No framework integrations found matching your criteria</p>
            {searchTerm && (
              <p className="text-gray-400 text-sm">Try adjusting your search terms or filters</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};