const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');

exports.setupSecurity = (app) => {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self)');
    req.requestId = uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.use(xss());
  app.use(mongoSanitize());
  app.use(hpp({ whitelist: ['sort', 'page', 'limit', 'fields'] }));
  app.use(compression());
};
