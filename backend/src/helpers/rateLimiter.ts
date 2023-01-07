import rateLimit from 'express-rate-limit';

// 300 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 450,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (request) => {
    return request.path === '/healthcheck' || request.path === '/api/status'
  }
});

// 5 requests per hour
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

// 10 requests per hour
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false
});

// 5 requests per hour
const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

export { apiLimiter, signupLimiter, loginLimiter, passwordLimiter };
