const envMapping = {
  Development: "dev",
  Staging: "staging",
  Production: "prod",
  Testing: "test",
};
  
const reverseEnvMapping = {
  dev: "Development",
  staging: "Staging",
  prod: "Production",
  test: "Testing",
};

const frameworks = [{
    "name": "Docker",
    "image": "Docker",
    "link": "https://infisical.com/docs/integrations/platforms/docker"
  }, {
    "name": "Docker Compose",
    "image": "Docker Compose",
    "link": "https://infisical.com/docs/integrations/platforms/docker-compose"
  }, {
    "name": "React",
    "image": "React",
    "link": "https://infisical.com/docs/integrations/frameworks/react"
  }, {
    "name": "Vue",
    "image": "Vue",
    "link": "https://infisical.com/docs/integrations/frameworks/vue"
  }, {
    "image": "Express",
    "link": "https://infisical.com/docs/integrations/frameworks/express"
  },{
    "image": "Next.js",
    "link": "https://infisical.com/docs/integrations/frameworks/nextjs"
  }, {
    "name": "Django",
    "image": "Django",
    "link": "https://infisical.com/docs/integrations/frameworks/django"
  }, {
    "name": "NestJS",
    "image": "NestJS",
    "link": "https://infisical.com/docs/integrations/frameworks/nestjs"
  }, {
    "name": "Nuxt",
    "image": "Nuxt",
    "link": "https://infisical.com/docs/integrations/frameworks/nuxt"
  }, {
    "name": "Gatsby",
    "image": "Gatsby",
    "link": "https://infisical.com/docs/integrations/frameworks/gatsby"
  }, {
    "name": "Remix",
    "image": "Remix",
    "link": "https://infisical.com/docs/integrations/frameworks/remix"
  }, {
    "name": "Vite",
    "image": "Vite",
    "link": "https://infisical.com/docs/integrations/frameworks/vite"
  }, {
    "image": "Fiber",
    "link": "https://infisical.com/docs/integrations/frameworks/fiber"
  }, {
    "name": "Flask",
    "image": "Flask",
    "link": "https://infisical.com/docs/integrations/frameworks/flask"
  }, {
    "name": "Laravel",
    "image": "Laravel",
    "link": "https://infisical.com/docs/integrations/frameworks/laravel"
  }, {
    "image": "Rails",
    "link": "https://infisical.com/docs/integrations/frameworks/rails"
  }
]

export {
  envMapping,
  frameworks,
  reverseEnvMapping
};
