/**
 * An Error that carries an HTTP status code, so route handlers and the global
 * error handler can translate it into a proper response.
 */
export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
