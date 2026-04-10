const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

export interface PlaceBasic {
  placeId: string;
  name: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string | null;
  mapsUrl: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Searches Google Places Text Search API and returns basic place info.
 * Paginates up to `maxPages` (each page = up to 20 results, max 3 pages per query).
 */
export async function searchPlaces(
  query: string,
  location: string,
  apiKey: string,
  maxPages = 3
): Promise<PlaceBasic[]> {
  const results: PlaceBasic[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    const params = new URLSearchParams({
      query: `${query} in ${location}`,
      key: apiKey,
    });
    if (pageToken) params.set('pagetoken', pageToken);

    const resp = await fetch(`${PLACES_BASE}/textsearch/json?${params}`);
    if (!resp.ok) {
      throw new Error(`Google Places HTTP error: ${resp.status}`);
    }

    const data = (await resp.json()) as {
      status: string;
      error_message?: string;
      results?: Array<{ place_id: string; name: string }>;
      next_page_token?: string;
    };

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(
        `Google Places API error: ${data.status}${data.error_message ? ' — ' + data.error_message : ''}`
      );
    }

    for (const place of data.results ?? []) {
      results.push({ placeId: place.place_id, name: place.name });
    }

    pageToken = data.next_page_token;
    page++;

    // Google requires a ~2s delay before the next_page_token becomes valid
    if (pageToken && page < maxPages) {
      await sleep(2000);
    }
  } while (pageToken && page < maxPages);

  return results;
}

/**
 * Fetches full details for a single place: address, phone, website, Maps URL.
 */
export async function getPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<PlaceDetails> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'name,formatted_address,formatted_phone_number,website,url',
    key: apiKey,
  });

  const resp = await fetch(`${PLACES_BASE}/details/json?${params}`);
  if (!resp.ok) {
    throw new Error(`Google Places Details HTTP error: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    status: string;
    result?: {
      name?: string;
      formatted_address?: string;
      formatted_phone_number?: string;
      website?: string;
      url?: string;
    };
  };

  if (data.status !== 'OK') {
    throw new Error(`Google Places Details API error: ${data.status}`);
  }

  const r = data.result ?? {};
  return {
    placeId,
    name: r.name ?? '',
    address: r.formatted_address ?? '',
    phone: r.formatted_phone_number ?? '',
    website: r.website ?? null,
    mapsUrl: r.url ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`,
  };
}
