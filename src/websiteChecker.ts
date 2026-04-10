import type { WebsiteStatus } from './leadTypes';

export interface WebsiteCheckResult {
  status: WebsiteStatus;
  statusCode?: number;
  error?: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Checks whether a website URL is reachable and returns a 2xx response.
 * Returns 'none' if url is null/undefined, 'broken' on error or non-2xx, 'ok' on success.
 */
export async function checkWebsite(url: string | null): Promise<WebsiteCheckResult> {
  if (!url) {
    return { status: 'none' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; LeadsBot/1.0; +https://github.com/pcosklo-lab/super-octo-doodle)',
      },
    });

    // Some servers reject HEAD — fall back to GET on 405
    if (resp.status === 405) {
      const getResp = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; LeadsBot/1.0; +https://github.com/pcosklo-lab/super-octo-doodle)',
        },
      });
      return {
        status: getResp.ok ? 'ok' : 'broken',
        statusCode: getResp.status,
      };
    }

    return {
      status: resp.ok ? 'ok' : 'broken',
      statusCode: resp.status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('abort') || message.includes('timeout');
    return {
      status: 'broken',
      error: isTimeout ? 'Request timed out' : message,
    };
  } finally {
    clearTimeout(timer);
  }
}
