export interface Character {
  id: string;
  name: string;
  level: number;
}

export interface Campaign {
  id: string;
  name: string;
  joinCode: string;
}

export class ApiError extends Error {
  status: number;
  info?: unknown;

  constructor(status: number, message: string, info?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.info = info;
  }
}

const API_BASE = "/api";

function deriveMessage(data: unknown, status: number): string {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const info = data as { message?: string; error?: string };
    if (info.message?.trim()) return info.message;
    if (info.error?.trim()) return info.error;
  }
  return `Request failed with status ${status}`;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network request failed";
    throw new ApiError(0, message);
  }

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    const message = deriveMessage(data, response.status);
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

export const api = {
  listCharacters: () => apiRequest<Character[]>("/characters"),
  createCharacter: (payload: { name: string; level: number }) =>
    apiRequest<Character>("/characters", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  listCampaigns: () => apiRequest<Campaign[]>("/campaigns"),
  createCampaign: (payload: { name: string }) =>
    apiRequest<Campaign>("/campaigns", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};
