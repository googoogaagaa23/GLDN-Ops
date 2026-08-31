import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const sourcePath = path.join(root, 'outputs', 'product-research', 'ebay-product-hunter-keywords-v1.0-2026-08-24.txt');
const outputPath = path.join(root, 'extension', 'product-research-output.json');
const rulePath = path.join(root, 'extension', 'listing-preflight-rules.json');

const unsafeSeed = /\b(?:adult|airsoft|alcohol|ammunition|airbag|autograph|battery|beer|brand|celebrity|character|collectible|copyright|coupon|crypto|diamond|drug|e-?cigarette|firearm|franchise|gun|hate|hidden camera|intimate|jewelry|knife|laser|liquor|lottery|medical|military|nicotine|nazi|ornament|party|pesticide|police|poster|prescription|raffle|replica|seed packet|social media|stamp|stock certificate|supplement|tactical|tobacco|trademark|vape|vero|weapon|wine bottle)\b/i;
const intellectualPropertyRisk = /\b(?:art print|banner|celebrity|character|collectible|designer|fan art|figurine|franchise|gift|greeting card|inspired by|keepsake|licensed|logo|official|ornament|photo|poster|souvenir|team|trademark|vero)\b/i;

const reserve = [
  'stacking bathroom bins', 'handled bathroom caddy', 'divided bathroom tray', 'bathroom shelf dividers',
  'stackable pantry bins', 'handled pantry caddy', 'divided pantry tray', 'pantry shelf dividers',
  'stacking office bins', 'handled office caddy', 'divided office tray', 'office shelf dividers',
  'stacking utility bins', 'handled utility caddy', 'divided utility tray', 'utility shelf dividers',
  'stacking laundry bins', 'handled laundry caddy', 'divided laundry tray', 'laundry shelf dividers',
  'stacking garage bins', 'handled garage caddy', 'divided garage tray', 'garage shelf dividers',
  'stacking kitchen bins', 'handled kitchen caddy', 'divided kitchen tray', 'kitchen shelf dividers',
  'stacking closet bins', 'handled closet caddy', 'divided closet tray', 'closet basket dividers',
  'stacking desk bins', 'handled desk caddy', 'divided desk tray', 'desk shelf dividers',
  'clear drawer baskets', 'mesh drawer baskets', 'narrow drawer baskets', 'deep drawer baskets',
  'clear cabinet baskets', 'mesh cabinet baskets', 'narrow cabinet baskets', 'deep cabinet baskets',
  'clear shelf baskets', 'mesh shelf baskets', 'narrow shelf baskets', 'deep shelf baskets',
  'clear countertop bins', 'mesh countertop bins', 'narrow countertop bins', 'deep countertop bins',
  'clear under shelf bins', 'mesh under shelf bins', 'narrow under shelf bins', 'deep under shelf bins',
  'clear wall storage bins', 'mesh wall storage bins', 'narrow wall storage bins', 'deep wall storage bins',
  'rotating storage caddy', 'tiered storage caddy', 'rolling storage caddy', 'collapsible storage caddy',
  'rotating organizer basket', 'tiered organizer basket', 'rolling organizer basket', 'collapsible organizer basket',
  'rotating utility tray', 'tiered utility tray', 'rolling utility cart', 'collapsible utility basket',
  'small parts storage tray', 'small parts storage caddy', 'small parts drawer bins', 'small parts shelf bins',
  'household supply organizer', 'household supply caddy', 'household supply basket', 'household supply tray',
  'cleaning supply organizer', 'cleaning supply caddy', 'cleaning supply basket', 'cleaning supply tray',
  'manual cleaning brush set', 'manual dusting brush set', 'manual scrub brush set', 'manual window squeegee',
  'silicone counter protector mat', 'silicone cabinet protector mat', 'silicone drawer protector mat', 'silicone shelf protector mat',
  'felt cabinet protector pads', 'felt drawer protector pads', 'felt wall protector pads', 'felt floor protector pads',
  'adjustable shelf divider set', 'adjustable drawer divider set', 'adjustable cabinet divider set', 'adjustable basket divider set'
];

const sourceTerms = fs.readFileSync(sourcePath, 'utf8')
  .split(/\r?\n/)
  .map((term) => term.replace(/\s+/g, ' ').trim().toLowerCase())
  .filter(Boolean);
if (sourceTerms.length !== 500) throw new Error(`Expected the reviewed 500-word source, received ${sourceTerms.length}.`);

const terms = [];
const seen = new Set();
for (const term of sourceTerms) {
  if (unsafeSeed.test(term) || intellectualPropertyRisk.test(term) || seen.has(term)) continue;
  seen.add(term);
  terms.push(term);
}
for (const term of reserve) {
  if (terms.length >= 500) break;
  if (unsafeSeed.test(term) || intellectualPropertyRisk.test(term) || seen.has(term)) continue;
  seen.add(term);
  terms.push(term);
}
if (terms.length !== 500) throw new Error(`The conservative seed pool contains ${terms.length}; exactly 500 are required.`);

function idFor(term, index) {
  const slug = term.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${String(index + 1).padStart(3, '0')}-${slug}`;
}

function familyFor(term) {
  if (/clean|brush|duster|squeegee|broom|dustpan|scrub|lint/.test(term)) return 'manual-cleaning';
  if (/desk|office|file|document|paper|pen|pencil|notebook|binder|letter/.test(term)) return 'office-organization';
  if (/kitchen|pantry|sink|cabinet|dish|pot|pan|bowl|cup|mug|utensil/.test(term)) return 'kitchen-organization';
  if (/bath|shower|toilet|towel|vanity|tissue/.test(term)) return 'bathroom-organization';
  if (/laundry|hamper|clothespin|drying/.test(term)) return 'laundry-organization';
  if (/garage|workshop|tool|hardware|pegboard|workbench|socket|wrench|screw/.test(term)) return 'workshop-organization';
  if (/felt|protector|bumper|liner|slider|leg cap|floor pad|draft stopper/.test(term)) return 'surface-protection';
  if (/closet|drawer|shelf|storage|organizer|basket|bin|tray|caddy|rack|holder|hook/.test(term)) return 'general-organization';
  return 'generic-household-accessory';
}

let officialRuleCount = 0;
try {
  const rules = JSON.parse(fs.readFileSync(rulePath, 'utf8'));
  officialRuleCount = (rules.rules || []).filter((rule) => rule.sourceType === 'official-ebay').length;
} catch {}

const payload = {
  schemaVersion: 2,
  version: '2.0.0-2026-08-30',
  generatedAt: '2026-08-30T00:00:00.000Z',
  title: 'GLDN Product Research Desk',
  description: 'Five hundred reviewed generic, unbranded starting phrases for EcomSniper Product Hunter, backed by a full official eBay prohibited-and-restricted policy-hub refresh.',
  disclaimer: 'These are lower-risk research starting phrases, not approved products and not eBay approval. A phrase can still return a prohibited, restricted, recalled, branded, counterfeit, patented, copyrighted, or otherwise infringing exact product.',
  readinessModel: {
    mode: 'review-unless-generic-allowlist',
    rule: 'Only an exact reviewed generic seed may start research. Exact products still need Listing Preflight and final human review of title, brand, model, images, packaging, provenance, seller eligibility, shipping, and recalls.',
    brandAndIp: 'Any detected or unknown brand, model, character, franchise, team, celebrity, logo, compatibility, replacement, authenticity, licensing, warranty, certification, art, media, or design claim stays in Needs review.',
    existingListings: 'Title/SKU-only existing listings that do not match an explicit official Block remain Needs review because the scan cannot prove authenticity, authorization, image rights, product safety, or eligibility.',
    hardBlockAuthority: 'Only current, exact official eBay evidence may create Block. Community evidence may create Review only.'
  },
  sourceCoverage: [
    {
      sourceType: 'official-ebay',
      label: 'Official eBay policy',
      status: 'full-hub-reviewed',
      reviewedSignals: 70,
      publishedRules: officialRuleCount,
      note: 'All policy links exposed by the prohibited-and-restricted items hub were reviewed on 2026-08-30, along with Counterfeit, Intellectual Property/VeRO, search manipulation, product safety, and eligibility requirements.',
      links: [
        'https://www.ebay.com/help/policies/prohibited-restricted-items/prohibited-restricted-items?id=4207',
        'https://www.ebay.com/help/policies/prohibited-restricted-items/counterfeit-item-policy?id=4276',
        'https://www.ebay.com/help/policies/listing-policies/selling-policies/intellectual-property-vero-program?id=4349',
        'https://www.ebay.com/sellercenter/resources/verified-rights-owner-profiles',
        'https://www.ebay.com/help/policies/listing-policies/search-browse-manipulation-policy?id=4243',
        'https://www.ebay.com/help/policies/prohibited-restricted-items/product-safety-policy?id=4300',
        'https://www.ebay.com/help/policies/prohibited-restricted-items/products-eligibility-requirements-policy?id=5271'
      ]
    },
    {
      sourceType: 'profile2-discord',
      label: 'Profile 2 EcomSniper Discord',
      status: 'active',
      reviewedSignals: 4,
      publishedRules: 2,
      note: 'The signed-in Profile 2 community refresh remains separate from official policy. Its two actionable findings are Review warnings only.',
      links: ['https://discord.com/channels/1225761896289009684/1291126334893981776/1534487049707454474']
    },
    {
      sourceType: 'profile2-telegram',
      label: 'Profile 2 EcomSniper Telegram',
      status: 'reviewed-ignore',
      reviewedSignals: 1,
      publishedRules: 0,
      note: 'The delivery-date finding remains Ignore because it is not an item-listing policy signal.',
      links: ['https://t.me/dropflowlister/21848']
    }
  ],
  searchSeeds: terms.map((term, index) => ({
    id: idFor(term, index),
    term,
    family: familyFor(term),
    reason: 'Reviewed generic, unbranded, non-powered physical-product research phrase; every exact result still requires Preflight and final human review.'
  })),
  avoidCategories: [
    'Any brand, model, product line, logo, character, franchise, artist, celebrity, team, media title, licensed design, compatibility, replacement, authenticity, warranty, certification, purity, or provenance claim',
    'Counterfeit-heavy categories: apparel, footwear, fashion accessories, jewelry, watches, perfume/cosmetics, electronics, software/media, art, collectibles, trading cards, autographs, and custom printed products',
    'Adult content; weapons, knives, firearms, tactical/military/police, lock bypass, surveillance, and illegal-activity products',
    'Medical/health devices, drugs, supplements, cosmetics, food, alcohol, tobacco/vape, pesticides, chemicals, hazardous materials, batteries, chargers, lasers, and regulated safety products',
    'Baby sleep/safety, helmets, car seats, cribs, micromobility, vehicle parts, emissions products, live animals, animal products, plants/seeds, and recalled products',
    'Currency, gift/credit cards, coupons, lottery/chance, gambling, financial products, cryptocurrency, real estate, travel, services, digital/intangible goods, personal data, social engagement, and review manipulation',
    'Anything requiring seller approval, licenses, permits, origin documentation, special shipping, regulatory labels, testing/certification, or a current recall lookup'
  ],
  workflow: [
    { step: 1, title: 'Choose reviewed generic words', instruction: 'Copy only versioned phrases from this desk. Unknown or branded phrases do not start Product Hunter research.' },
    { step: 2, title: 'Run Product Hunter', instruction: 'Paste one reviewed phrase per line into EcomSniper Product Hunter and export the resulting exact Amazon links.' },
    { step: 3, title: 'Run Listing Preflight', instruction: 'Paste every exact link into Listing Preflight. Explicit official prohibitions Block; conditional, branded, IP-sensitive, stale, unknown, or incomplete evidence stays in Needs review.' },
    { step: 4, title: 'Continue Ready links only', instruction: 'Copy only Ready links into Bulk Poster. Review and Block rows never continue through the handoff.' },
    { step: 5, title: 'Final human review', instruction: 'Before any listing action, inspect the exact title, brand, model, images, packaging, rights, provenance, safety/recall status, seller eligibility, category, shipping, and generated eBay listing. Ready never means eBay approval.' }
  ]
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${payload.searchSeeds.length} reviewed Product Hunter phrases to ${outputPath}`);
