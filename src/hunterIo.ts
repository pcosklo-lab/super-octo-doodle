const HUNTER_BASE = 'https://api.hunter.io/v2';

export interface HunterEmail {
  value: string;
  type: string;
  confidence: number;
}

export interface HunterResult {
  domain: string;
  emails: HunterEmail[];
}

/**
 * Searches Hunter.io for email addresses associated with a domain.
 * Returns an empty list (non-fatal) if the domain is not found or the key has no credits.
 */
export async function findEmailsByDomain(
  domain: string,
  apiKey: string,
  limit = 5
): Promise<HunterResult> {
  const params = new URLSearchParams({
    domain,
    api_key: apiKey,
    limit: String(limit),
  });

  const resp = await fetch(`${HUNTER_BASE}/domain-search?${params}`);
  if (!resp.ok) {
    return { domain, emails: [] };
  }

  const data = (await resp.json()) as {
    data?: { emails?: Array<{ value: string; type: string; confidence: number }> };
    errors?: unknown[];
  };

  if (data.errors?.length) {
    return { domain, emails: [] };
  }

  return {
    domain,
    emails: data.data?.emails ?? [],
  };
}

/**
 * Extracts the registrable domain from a URL string (strips www prefix).
 * Returns null if the URL is invalid.
 */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
