const http = require('http');
const PORT = process.env.PORT || 4000;
const options = {
  host: 'localhost',
  port: PORT,
  timeout: 2000,
  path: '/healthcheck'
};

const healthCheck = http.request(options, (res) => {
  console.log(`HEALTHCHECK STATUS: ${res.statusCode}`);
  if (res.statusCode == 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

healthCheck.on('error', function (err) {
  console.error(`HEALTH CHECK ERROR: ${err}`);
  process.exit(1);
});

healthCheck.end();
