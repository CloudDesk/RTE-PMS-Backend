export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  errorCode: string;
  message: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function successResponse<T>(
  message: string,
  data: T,
  meta?: Record<string, unknown>,
): ApiSuccessResponse<T> {
  return {
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
  };
}

export function errorResponse(
  errorCode: string,
  message: string,
): ApiErrorResponse {
  return {
    success: false,
    errorCode,
    message,
  };
}
