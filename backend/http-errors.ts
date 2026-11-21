import type { Response } from 'express';

type FieldErrors = Record<string, string[] | undefined>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: FieldErrors;

  constructor(status: number, code: string, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function sendApiError(
  response: Response,
  status: number,
  code: string,
  message: string,
  fieldErrors?: FieldErrors,
): void {
  response.set('Cache-Control', 'no-store').status(status).json({
    code,
    message,
    requestId: response.locals.requestId,
    ...(fieldErrors ? { fieldErrors } : {}),
  });
}
