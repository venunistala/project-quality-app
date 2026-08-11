export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`);
    this.name = 'NotFoundError';
  }
}
