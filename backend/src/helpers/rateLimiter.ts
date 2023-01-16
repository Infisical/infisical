import rateLimit from 'express-rate-limit';

// 120 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (request) => {
    return request.path === '/healthcheck' || request.path === '/api/status'
  }
});

// 10 requests per minute
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

// 10 requests per hour
const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

export { 
  apiLimiter, 
  authLimiter,
  passwordLimiter 
};
