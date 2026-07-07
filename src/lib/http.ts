/**
 * Safely parses a fetch Response as JSON. If the body is not JSON (e.g. the
 * server returned an HTML error/404 page), this throws a clear error instead of
 * the cryptic "Unexpected token '<', \"<!DOCTYPE\"... is not valid JSON".
 */
export async function parseJsonResponse<T = unknown>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (data === null && text) {
    if (!response.ok) {
      throw new Error(`${fallbackMessage} (server error ${response.status})`);
    }
    throw new Error(fallbackMessage);
  }

  return data as T;
}
