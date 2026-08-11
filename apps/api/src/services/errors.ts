export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

// Deliberately generic - the same error covers "no such email" and "wrong
// password" so a client can never distinguish which one it was.
export class InvalidCredentialsError extends Error {
  readonly statusCode = 401;
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Invalid email or password.');
    this.name = 'InvalidCredentialsError';
  }
}
