export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Field → message map from the API's validation errors. */
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const errorMessage = (error: unknown, fallback = 'Something went wrong') =>
  error instanceof Error ? error.message : fallback;
