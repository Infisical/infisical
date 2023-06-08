import rateLimit from 'express-rate-limit';
const MongoStore = require('rate-limit-mongo');

// 200 per minute
export const apiLimiter = rateLimit({
  store: new MongoStore({
    uri: process.env.MONGO_URL,
    expireTimeMs: 1000 * 60,
    collectionName: "expressRateRecords-apiLimiter",
    errorHandler: console.error.bind(null, 'rate-limit-mongo')
  }),
  windowMs: 1000 * 60,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (request) => {
    return request.path === '/healthcheck' || request.path === '/api/status'
  },
  keyGenerator: (req, res) => {
    return req.realIP
  }
});

// 50 requests per 1 hours
const authLimit = rateLimit({
  store: new MongoStore({
    uri: process.env.MONGO_URL,
    expireTimeMs: 1000 * 60 * 60,
    errorHandler: console.error.bind(null, 'rate-limit-mongo'),
    collectionName: "expressRateRecords-authLimit",
  }),
  windowMs: 1000 * 60 * 60,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.realIP
  }
});

// 5 requests per 1 hour
export const passwordLimiter = rateLimit({
  store: new MongoStore({
    uri: process.env.MONGO_URL,
    expireTimeMs: 1000 * 60 * 60,
    errorHandler: console.error.bind(null, 'rate-limit-mongo'),
    collectionName: "expressRateRecords-passwordLimiter",
  }),
  windowMs: 1000 * 60 * 60,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.realIP
  }
});

export const authLimiter = (req: any, res: any, next: any) => {
  if (process.env.NODE_ENV === 'production') {
    authLimit(req, res, next);
  } else {
    next();
  }
};