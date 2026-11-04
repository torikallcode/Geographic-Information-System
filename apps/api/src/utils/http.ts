export class AppError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;

  constructor(statusCode: number, message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, message, { code: 'BAD_REQUEST', details });
}

export function unauthorized(message = 'Silakan masuk terlebih dahulu.'): AppError {
  return new AppError(401, message, { code: 'UNAUTHORIZED' });
}

export function forbidden(message = 'Anda tidak memiliki akses untuk tindakan ini.'): AppError {
  return new AppError(403, message, { code: 'FORBIDDEN' });
}

export function notFound(message = 'Data tidak ditemukan.'): AppError {
  return new AppError(404, message, { code: 'NOT_FOUND' });
}

export function conflict(message: string): AppError {
  return new AppError(409, message, { code: 'CONFLICT' });
}
