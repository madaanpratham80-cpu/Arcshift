import type { Request, RequestHandler } from 'express';
import type { MongoDatabase } from './db/mongo.ts';
import { ApiError } from './http-errors.ts';

export function assertAppOrigin(request: Request, origin: string): void {
  if (request.get('origin') !== origin) {
    throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Open the app before submitting this request.');
  }
}

export function requireDatabaseReady(checkReadiness: () => Promise<boolean>): RequestHandler {
  return async (_request, _response, next) => {
    if (!await checkReadiness()) {
      throw new ApiError(503, 'NOT_READY', 'The service is temporarily unavailable.');
    }
    next();
  };
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.get('idempotency-key') ?? '';
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(key)) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send a valid Idempotency-Key header.');
  }
  return key;
}

export async function requireTransactionTopology(database: MongoDatabase) {
  if (!await database.supportsTransactions()) {
    throw new ApiError(503, 'TRANSACTIONS_REQUIRED', 'This action requires a transaction-capable MongoDB deployment.');
  }
}
