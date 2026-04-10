import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';
import { searchPlaces, getPlaceDetails } from './googlePlaces';
import { checkWebsite } from './websiteChecker';
import { findEmailsByDomain, extractDomain } from './hunterIo';
import type { BusinessLead, LeadsResult } from './leadTypes';

dotenv.config();

// ─── Configuration ────────────────────────────────────────────────────────────

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? '';
const HUNTER_IO_API_KEY = process.env.HUNTER_IO_API_KEY ?? '';

// Accept CLI args: npm run leads -- "restaurants" "Austin, TX" 50
const [, , queryArg, locationArg, countArg] = process.argv;
const QUERY = queryArg ?? process.env.LEADS_QUERY ?? 'local businesses';
const LOCATION = locationArg ?? process.env.LEADS_LOCATION ?? 'New York, NY';
const TARGET_COUNT = parseInt(countArg ?? process.env.LEADS_COUNT ?? '50', 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatLeadCsvRow(lead: BusinessLead): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [
    esc(lead.name),
    esc(lead.address),
    esc(lead.phone),
    esc(lead.website ?? ''),
    lead.websiteStatus,
    lead.websiteStatusCode?.toString() ?? '',
    esc(lead.emails.map((e) => e).join('; ')),
    esc(lead.mapsUrl),
  ].join(',');
}

function buildMarkdownReport(result: LeadsResult): string {
  const noWebsite = result.leads.filter((l) => l.websiteStatus === 'none');
  const broken = result.leads.filter((l) => l.websiteStatus === 'broken');

  const lines: string[] = [
    `# Business Leads Report`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| Query | ${result.query} in ${result.location} |`,
    `| Generated | ${new Date(result.generatedAt).toLocaleString()} |`,
    `| Total Leads | **${result.leads.length}** |`,
    `| No Website | ${result.totalWithNoWebsite} |`,
    `| Broken Website | ${result.totalWithBrokenWebsite} |`,
    `| Businesses Evaluated | ${result.totalEvaluated} |`,
    ``,
    `---`,
    ``,
  ];

  if (noWebsite.length > 0) {
    lines.push(`## No Website (${noWebsite.length})`);
    lines.push('');
    for (const lead of noWebsite) {
      lines.push(`### ${lead.name}`);
      lines.push(`| | |`);
      lines.push(`|---|---|`);
      if (lead.address) lines.push(`| Address | ${lead.address} |`);
      if (lead.phone) lines.push(`| Phone | ${lead.phone} |`);
      if (lead.emails.length > 0) lines.push(`| Emails | ${lead.emails.join(', ')} |`);
      lines.push(`| Google Maps | [View](${lead.mapsUrl}) |`);
      lines.push('');
    }
  }

  if (broken.length > 0) {
    lines.push(`## Broken Website (${broken.length})`);
    lines.push('');
    for (const lead of broken) {
      lines.push(`### ${lead.name}`);
      lines.push(`| | |`);
      lines.push(`|---|---|`);
      if (lead.address) lines.push(`| Address | ${lead.address} |`);
      if (lead.phone) lines.push(`| Phone | ${lead.phone} |`);
      lines.push(
        `| Website | ${lead.website} _(${lead.websiteStatusCode ? `HTTP ${lead.websiteStatusCode}` : lead.websiteError ?? 'unreachable'})_ |`
      );
      if (lead.emails.length > 0) lines.push(`| Emails | ${lead.emails.join(', ')} |`);
      lines.push(`| Google Maps | [View](${lead.mapsUrl}) |`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.error(chalk.red('\nError: GOOGLE_PLACES_API_KEY is required'));
    console.error(chalk.yellow('  1. Go to https://console.cloud.google.com/apis/credentials'));
    console.error(chalk.yellow('  2. Create an API key and enable the Places API'));
    console.error(chalk.yellow('  3. Add it to your .env file as GOOGLE_PLACES_API_KEY=...\n'));
    process.exit(1);
  }

  console.log(chalk.bold.blue('\n  Business Leads Generator\n'));
  console.log(chalk.gray(`  Query     : ${QUERY}`));
  console.log(chalk.gray(`  Location  : ${LOCATION}`));
  console.log(chalk.gray(`  Target    : ${TARGET_COUNT} leads`));
  console.log(
    chalk.gray(
      `  Email     : ${HUNTER_IO_API_KEY ? 'Hunter.io enabled' : 'Disabled (set HUNTER_IO_API_KEY to enable)'}`
    )
  );
  console.log('');

  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // ── Phase 1: Search Google Places ──────────────────────────────────────────
  const searchSpinner = ora('Searching Google Places...').start();
  let places: Array<{ placeId: string; name: string }> = [];

  try {
    // 3 pages × 20 results = up to 60 candidates to filter from
    places = await searchPlaces(QUERY, LOCATION, GOOGLE_PLACES_API_KEY, 3);
    searchSpinner.succeed(chalk.green(`Found ${places.length} businesses to evaluate`));
  } catch (err) {
    searchSpinner.fail(chalk.red('Google Places search failed'));
    console.error(chalk.red(String(err)));
    process.exit(1);
  }

  if (places.length === 0) {
    console.log(chalk.yellow('\nNo results from Google Places. Try a different query or location.\n'));
    process.exit(0);
  }

  // ── Phase 2: Get details + check websites ──────────────────────────────────
  const leads: BusinessLead[] = [];
  let evaluated = 0;
  const detailSpinner = ora('Fetching details and checking websites...').start();

  for (const place of places) {
    if (leads.length >= TARGET_COUNT) break;

    try {
      const details = await getPlaceDetails(place.placeId, GOOGLE_PLACES_API_KEY);
      await sleep(200); // stay well under the 10 QPS limit

      const check = await checkWebsite(details.website);
      evaluated++;

      if (check.status === 'ok') {
        detailSpinner.text = chalk.cyan(
          `Evaluated ${evaluated}/${places.length} — ${leads.length} leads found...`
        );
        continue; // website is fine — not a lead
      }

      // ── Phase 3: Email lookup via Hunter.io ─────────────────────────────
      let emails: string[] = [];
      if (HUNTER_IO_API_KEY && details.website) {
        const domain = extractDomain(details.website);
        if (domain) {
          try {
            const hunterResult = await findEmailsByDomain(domain, HUNTER_IO_API_KEY);
            emails = hunterResult.emails.map((e) => e.value);
          } catch {
            // Non-fatal — proceed without emails
          }
        }
      }

      leads.push({
        name: details.name,
        address: details.address,
        phone: details.phone,
        website: details.website,
        websiteStatus: check.status,
        websiteStatusCode: check.statusCode,
        websiteError: check.error,
        emails,
        placeId: details.placeId,
        mapsUrl: details.mapsUrl,
        foundAt: new Date().toISOString(),
      });

      detailSpinner.text = chalk.cyan(
        `Evaluated ${evaluated}/${places.length} — ${leads.length} leads found...`
      );
    } catch {
      evaluated++;
      // Non-fatal — skip this business and continue
    }

    await sleep(100);
  }

  detailSpinner.succeed(
    chalk.green(`Done — ${leads.length} leads found from ${evaluated} businesses evaluated`)
  );

  if (leads.length === 0) {
    console.log(
      chalk.yellow(
        '\nNo leads found — all businesses in this search have working websites.\n' +
          'Try a different query, location, or industry to find more opportunities.\n'
      )
    );
    process.exit(0);
  }

  // ── Phase 4: Write reports ─────────────────────────────────────────────────
  const noWebsite = leads.filter((l) => l.websiteStatus === 'none');
  const brokenWebsite = leads.filter((l) => l.websiteStatus === 'broken');

  const result: LeadsResult = {
    leads,
    totalEvaluated: evaluated,
    totalWithNoWebsite: noWebsite.length,
    totalWithBrokenWebsite: brokenWebsite.length,
    query: QUERY,
    location: LOCATION,
    generatedAt: new Date().toISOString(),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // CSV
  const csvPath = path.join(reportsDir, `leads-${timestamp}.csv`);
  const csvHeader = 'Name,Address,Phone,Website,Website Status,Status Code,Emails,Google Maps';
  const csvRows = leads.map(formatLeadCsvRow);
  fs.writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'), 'utf-8');

  // Markdown
  const mdPath = path.join(reportsDir, `leads-${timestamp}.md`);
  fs.writeFileSync(mdPath, buildMarkdownReport(result), 'utf-8');

  // ── Console summary ────────────────────────────────────────────────────────
  console.log('\n' + chalk.bold.white('Summary:'));
  console.log(chalk.white(`  Total leads       : ${chalk.green(leads.length)}`));
  console.log(chalk.white(`  No website        : ${chalk.yellow(noWebsite.length)}`));
  console.log(chalk.white(`  Broken website    : ${chalk.red(brokenWebsite.length)}`));
  console.log(chalk.white(`  Emails found      : ${leads.filter((l) => l.emails.length > 0).length} businesses`));

  console.log('\n' + chalk.bold.green('Reports saved:'));
  console.log('  ' + chalk.underline(csvPath));
  console.log('  ' + chalk.underline(mdPath) + '\n');
}

main().catch((err) => {
  console.error(chalk.red('\nFatal error:'), err);
  process.exit(1);
});
