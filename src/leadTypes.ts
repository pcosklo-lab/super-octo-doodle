export type WebsiteStatus = 'none' | 'broken' | 'ok';

export interface BusinessLead {
  name: string;
  address: string;
  phone: string;
  website: string | null;
  websiteStatus: WebsiteStatus;
  websiteStatusCode?: number;
  websiteError?: string;
  emails: string[];
  placeId: string;
  mapsUrl: string;
  foundAt: string;
}

export interface LeadSearchOptions {
  query: string;
  location: string;
  targetCount: number;
}

export interface LeadsResult {
  leads: BusinessLead[];
  totalEvaluated: number;
  totalWithNoWebsite: number;
  totalWithBrokenWebsite: number;
  query: string;
  location: string;
  generatedAt: string;
}
