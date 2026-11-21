import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import { ApiError, sendApiError } from './http-errors.ts';

const handleUnexpectedError: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    sendApiError(response, error.status, error.code, error.message, error.fieldErrors);
    return;
  }
  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
    sendApiError(response, error.type === 'entity.too.large' ? 413 : 400, 'VALIDATION_FAILED',
      'Review the submitted fields and try again.');
    return;
  }

  console.error('Unhandled API error', { requestId: response.locals.requestId });
  sendApiError(response, 500, 'INTERNAL_ERROR', 'Something went wrong. Try again.');
};

export function createApp(
  apiRoutes = express.Router(),
  checkReadiness = async () => false,
  webRoot?: string,
) {
  const app = express();

  app.disable('x-powered-by');

  app.use((_request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.set('X-Request-Id', requestId);
    next();
  });

  app.get('/healthz', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ data: { status: 'ok' } });
  });

  app.get('/readyz', async (_request, response) => {
    if (await checkReadiness()) {
      response.set('Cache-Control', 'no-store').json({ data: { status: 'ready' } });
      return;
    }

    sendApiError(response, 503, 'NOT_READY', 'The service is temporarily unavailable.');
  });

  app.use('/api', apiRoutes);
  app.use('/api', (_request, response) => {
    sendApiError(response, 404, 'NOT_FOUND', 'This resource is unavailable.');
  });

  if (webRoot) {
    app.use('/assets', express.static(join(webRoot, 'assets'), { index: false, immutable: true, maxAge: '1y' }));
    const webRoutes = [
      '/', '/login', '/signup', '/terms', '/admin', '/onboarding', '/app',
      '/app/coach{/:id}', '/app/history', '/app/settings', '/app/versions{/:version}', '/app/proposals/:id',
    ];
    const indexPath = join(webRoot, 'index.html');
    function webPage(status: number): express.RequestHandler {
      return (_request, response, next) => {
        response.status(status).sendFile(indexPath, { headers: { 'Cache-Control': 'no-cache' } }, (error) => {
          if (error) next(error);
        });
      };
    }
    app.get(webRoutes, webPage(200));
    const notFound = webPage(404);
    app.get('/{*path}', (request, response, next) => {
      if (/^\/assets(?:\/|$)/i.test(request.path) || request.accepts(['html', 'json']) !== 'html') {
        next();
        return;
      }
      notFound(request, response, next);
    });
  }

  app.use((_request, response) => {
    sendApiError(response, 404, 'NOT_FOUND', 'This resource is unavailable.');
  });

  app.use(handleUnexpectedError);

  return app;
}
