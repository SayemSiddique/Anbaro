export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const authenticationRequired = () =>
  new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');

export const invalidCredentials = () =>
  new ApiError(401, 'AUTH_INVALID_CREDENTIALS', 'Email or password is incorrect.');

export const sessionInvalid = () =>
  new ApiError(401, 'AUTH_SESSION_INVALID', 'Your session is invalid or has expired.');

export const activeOrganizationRequired = () =>
  new ApiError(403, 'ACTIVE_ORGANIZATION_REQUIRED', 'Select an active organization first.');

export const permissionDenied = (resource: string, action: string) =>
  new ApiError(
    403,
    'AUTHZ_PERMISSION_DENIED',
    'You do not have permission to perform this action.',
    {
      resource,
      action,
    },
  );

export const locationForbidden = (locationId: string) =>
  new ApiError(403, 'AUTHZ_LOCATION_FORBIDDEN', 'You are not assigned to this location.', {
    locationId,
  });
