export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class PermissionDeniedError extends ServiceError {
  constructor(message = 'Anda tidak memiliki izin untuk melakukan aksi ini.') {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

export class AuthenticationError extends ServiceError {
  constructor(message = 'Email atau password tidak valid.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}
