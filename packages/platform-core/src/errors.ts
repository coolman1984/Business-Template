/** Errors a command may raise on purpose. Anything else is an internal failure. */
export class BusinessError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends BusinessError {
  constructor() {
    super('unauthenticated', 'A valid session is required.', 401);
  }
}

export class ForbiddenError extends BusinessError {
  constructor(reasonCode: string, details: Record<string, unknown> = {}) {
    super('forbidden', `Not allowed (${reasonCode}).`, 403, { reasonCode, ...details });
  }
}

export class ValidationError extends BusinessError {
  constructor(details: Record<string, unknown>) {
    super('invalid_input', 'The request is not valid for this command.', 400, details);
  }
}

export class NotFoundError extends BusinessError {
  constructor(resource: string) {
    super('not_found', `${resource} not found.`, 404, { resource });
  }
}

export class ConflictError extends BusinessError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, message, 409, details);
  }
}
