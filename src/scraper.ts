import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import UserAgent from 'user-agents';
import type { Page, ElementHandle } from 'playwright';
import type {
  EtsyProduct,
  ScrapeResult,
  ScrapeError,
  ScraperOptions,
  ScrapeProgress,
} from './types';

chromium.use(StealthPlugin());

const DEFAULT_OPTIONS: Required<ScraperOptions> = {
  pages: 4,
  delayMin: 1000,
  delayMax: 3000,
  headless: true,
  searchQuery: 'digital download printable',
};

function buildUrl(query: string, page: number): string {
  const params = new URLSearchParams({
    q: query,
    listing_type: 'digital',
    sort_on: 'score',
    ref: 'search_bar',
  });
  if (page > 1) {
    params.set('page', String(page));
  }
  return `https://www.etsy.com/search?${params.toString()}`;
}

function parsePrice(raw: string): number {
  const match = raw.match(/[\d,]+\.?\d*/);
  if (!match) return 0;
  return parseFloat(match[0].replace(/,/g, ''));
}

function parseCurrency(raw: string): string {
  if (raw.includes('CA$') || raw.includes('CAD')) return 'CAD';
  if (raw.includes('£')) return 'GBP';
  if (raw.includes('€')) return 'EUR';
  return 'USD';
}

function parseReviewCount(raw: string): number {
  // Handles "(1,234)", "1234 reviews", "1.2k"
  const kMatch = raw.match(/([\d.]+)k/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const numMatch = raw.match(/[\d,]+/);
  if (!numMatch) return 0;
  return parseInt(numMatch[0].replace(/,/g, ''), 10);
}

async function trySelectText(
  card: ElementHandle,
  selectors: string[]
): Promise<string> {
  for (const selector of selectors) {
    try {
      const text = await card.$eval(selector, (el) => el.textContent?.trim() ?? '');
      if (text) return text;
    } catch {
      // try next
    }
  }
  return '';
}

async function extractSalesCount(card: ElementHandle): Promise<number | null> {
  try {
    const fullText = await card.textContent();
    if (!fullText) return null;
    const match = fullText.match(/([\d,]+)\s+sales/i);
    if (match) return parseInt(match[1].replace(/,/g, ''), 10);
  } catch {
    // not available
  }
  return null;
}

async function extractProductFromCard(
  card: ElementHandle
): Promise<Partial<EtsyProduct> | null> {
  try {
    const title = await trySelectText(card, [
      'h3.v2-listing-card__title',
      'p.v2-listing-card__title',
      'h3[class*="listing-card"]',
      'h3[class*="v2-listing"]',
      'h3',
    ]);
    if (!title) return null;

    const priceRaw = await trySelectText(card, [
      '[class*="currency-value"]',
      '[class*="lc-price"] [class*="currency-value"]',
      '.wt-text-title-01',
      '[class*="price"]',
    ]);

    const sellerName = await trySelectText(card, [
      'p.wt-text-gray',
      '[class*="shop-name"]',
      'span[class*="shop"]',
      '.v2-listing-card__shop',
    ]);

    const reviewText = await trySelectText(card, [
      '[class*="review-count"]',
      'span[class*="count"]',
      '.wt-text-body-01 span',
      '[class*="stars"] + span',
    ]);

    const productUrl = await card
      .$eval('a[href*="/listing/"]', (el) => (el as HTMLAnchorElement).href)
      .catch(() => '');

    const salesCount = await extractSalesCount(card);

    const price = parsePrice(priceRaw);
    const currency = parseCurrency(priceRaw);
    const reviewCount = parseReviewCount(reviewText);

    return {
      title,
      sellerName: sellerName || 'Unknown',
      price,
      priceRaw,
      currency,
      reviewCount,
      rating: null,
      salesCount,
      productUrl,
      tags: [],
      scrapedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function randomDelay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight * 0.8) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
  await page.waitForTimeout(500);
}

async function scrapePage(page: Page, url: string): Promise<EtsyProduct[]> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for product cards
  await page
    .waitForSelector(
      '[data-search-results-grid] li, [data-search-results] li, .v2-listing-card',
      { timeout: 15000 }
    )
    .catch(() => {
      // Some pages may use different containers, proceed anyway
    });

  await simulateScroll(page);

  // Try multiple card container selectors
  let cards: ElementHandle[] = [];
  const cardSelectors = [
    '[data-search-results-grid] li',
    '[data-search-results] li',
    'li[data-et-region]',
    '.v2-listing-card',
  ];

  for (const selector of cardSelectors) {
    cards = await page.$$(selector);
    if (cards.length > 0) break;
  }

  const products: EtsyProduct[] = [];
  for (const card of cards) {
    const product = await extractProductFromCard(card);
    if (product && product.title && product.productUrl) {
      products.push(product as EtsyProduct);
    }
  }

  return products;
}

export async function scrapeEtsyDigitalProducts(
  options: ScraperOptions = {},
  onProgress?: (progress: ScrapeProgress) => void
): Promise<ScrapeResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ua = new UserAgent({ deviceCategory: 'desktop' });

  const browser = await chromium.launch({
    headless: opts.headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    userAgent: ua.toString(),
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    },
  });

  const page = await context.newPage();
  const allProducts: EtsyProduct[] = [];
  const errors: ScrapeError[] = [];
  let pagesScraped = 0;

  try {
    for (let pageNum = 1; pageNum <= opts.pages; pageNum++) {
      const url = buildUrl(opts.searchQuery, pageNum);

      onProgress?.({
        currentPage: pageNum,
        totalPages: opts.pages,
        productsFound: allProducts.length,
      });

      try {
        const products = await scrapePage(page, url);
        allProducts.push(...products);
        pagesScraped++;
      } catch (err) {
        errors.push({
          page: pageNum,
          message: err instanceof Error ? err.message : String(err),
          url,
        });
      }

      if (pageNum < opts.pages) {
        await randomDelay(opts.delayMin, opts.delayMax);
      }
    }
  } finally {
    await browser.close();
  }

  if (allProducts.length < 20) {
    throw new Error(
      `Only ${allProducts.length} products scraped (minimum 20 required). ` +
        'Etsy may be blocking the scraper. Try again later or check your network.'
    );
  }

  return {
    products: allProducts,
    totalScraped: allProducts.length,
    pagesScraped,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
