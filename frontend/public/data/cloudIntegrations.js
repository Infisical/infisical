import {
    CLIENT_ID_HEROKU,
    CLIENT_ID_NETLIFY
} from '../../components/utilities/config';

const cloudIntegrationOptions = [
    {
        name: 'Heroku',
        slug: 'heroku',
        image: 'Heroku', 
        isAvailable: true,
        type: 'oauth2',
        clientId: CLIENT_ID_HEROKU,
        docsLink: ''
    },
    {
        name: 'Vercel',
        slug: 'vercel',
        image: 'Vercel', 
        isAvailable: true,
        type: 'vercel',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Netlify',
        slug: 'netlify',
        image: 'Netlify', 
        isAvailable: true,
        type: 'oauth2',
        clientId: CLIENT_ID_NETLIFY,
        docsLink: ''
    },
    {
        name: 'Google Cloud Platform',
        slug: 'gcp',
        image: 'Google Cloud Platform', 
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Amazon Web Services',
        slug: 'aws',
        image: 'Amazon Web Services', 
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Microsoft Azure',
        slug: 'azure',
        image: 'Microsoft Azure', 
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Travis CI',
        slug: 'travisci',
        image: 'Travis CI', 
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Circle CI',
        slug: 'circleci',
        image: 'Circle CI', 
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    }
]

export { cloudIntegrationOptions };