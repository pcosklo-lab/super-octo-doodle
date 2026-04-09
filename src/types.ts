export interface EtsyProduct {
  title: string;
  sellerName: string;
  price: number;
  priceRaw: string;
  currency: string;
  reviewCount: number;
  rating: number | null;
  salesCount: number | null;
  productUrl: string;
  tags: string[];
  scrapedAt: string;
}

export interface ScrapeError {
  page: number;
  message: string;
  url: string;
}

export interface ScrapeResult {
  products: EtsyProduct[];
  totalScraped: number;
  pagesScraped: number;
  errors: ScrapeError[];
  scrapedAt: string;
}

export interface ScraperOptions {
  pages?: number;
  delayMin?: number;
  delayMax?: number;
  headless?: boolean;
  searchQuery?: string;
}

export interface ScrapeProgress {
  currentPage: number;
  totalPages: number;
  productsFound: number;
}

export interface AnalysisResult {
  markdownReport: string;
  executiveSummary: string;
}

export interface AgentOptions {
  model?: string;
  maxTokens?: number;
}
