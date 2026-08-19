type DatabaseDiagnosticContext = Record<string, string | number | boolean | undefined>;

function cosmosErrorDetails(error: unknown): { code?: string | number; activityId?: string } {
  const value = error as any;
  const headers = value?.response?.headers ?? value?.headers ?? {};
  const message = String(value?.message ?? '');
  const activityMatch = message.match(/activity\s*id\s*[:=]\s*([a-z0-9-]+)/i);
  return {
    code: value?.code ?? value?.statusCode ?? value?.response?.status,
    activityId:
      value?.activityId ??
      value?.activityID ??
      headers['x-ms-activity-id'] ??
      headers['x-ms-request-id'] ??
      activityMatch?.[1],
  };
}

/** Emit structured, non-PII timings for Cosmos-backed production operations. */
export async function traceDatabaseOperation<T>(
  operation: string,
  context: DatabaseDiagnosticContext,
  execute: () => Promise<T>,
  recordCount?: (result: T) => number | undefined,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await execute();
    console.info('[database-performance]', {
      operation,
      durationMs: Date.now() - startedAt,
      ...context,
      recordCount: recordCount?.(result),
    });
    return result;
  } catch (error: unknown) {
    console.error('[database-performance]', {
      operation,
      durationMs: Date.now() - startedAt,
      ...context,
      ...cosmosErrorDetails(error),
      failed: true,
    });
    throw error;
  }
}

export const databaseDiagnosticInternals = { cosmosErrorDetails };
