import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reviewedAt = '2026-09-13';
const version = '2026-09-13.2';
const ipUrl = 'https://www.ebay.com/help/policies/protecting-intellectual-property/vero-program?id=4349';
const counterfeitUrl = 'https://www.ebay.com/help/policies/prohibited-restricted-items/counterfeit-item-policy?id=4276';
const decisions = [];
const add = (value, action, reason, conditions = {}) => decisions.push({
  type: Object.keys(conditions).length ? 'compound' : 'keyword', value, ...conditions, action, reason,
  policyTopic: 'Intellectual property and counterfeit items',
  evidenceKind: action === 'block' ? 'explicit-prohibition' : 'conditional-review',
  reviewedBy: 'GLDN official eBay policy review', reviewedAt,
  source: 'official-ebay-policy-reviewed', sourceType: 'official-ebay', authority: 'eBay',
  evidenceUrls: [ipUrl, counterfeitUrl]
});

add('Counterfeit and knockoff sale claims', 'block',
  'The text describes counterfeit or knockoff goods. Counterfeit goods cannot be listed, even when disclosed. Inspect the exact matched product before ending any existing listing.',
  { anyOf: ['knockoff', 'knockoffs', 'knock-off', 'knock-offs', 'knock off replica', 'counterfeit goods', 'counterfeit replica', 'counterfeits for sale', 'not authentic', 'fake designer', 'fake branded'], noneOf: ['counterfeit detector', 'counterfeit detection', 'counterfeit prevention guide'] });
for (const word of ['unauthorized', 'unauthorised']) {
  add(`${word} copies and branded merchandise`, 'block',
    'Unauthorized copies or uses of protected logos and characters are not allowed. Calling them replicas or unofficial does not supply permission.',
    { allOf: [word], anyOf: ['copy', 'copies', 'reproduction', 'reproductions', 'logo', 'logos', 'character merchandise', 'branded merchandise', 'reprint', 'reprints'] });
}
add('Unlicensed copies of protected material', 'block',
  'The product explicitly describes unlicensed copies or protected-logo merchandise. Permission is required; a disclaimer does not make infringement acceptable.',
  { allOf: ['unlicensed'], anyOf: ['logo', 'logos', 'character merchandise', 'movie copy', 'movie copies', 'software copy', 'software copies', 'music copy', 'music copies', 'branded merchandise'] });
add('Bootleg entertainment and software', 'block',
  'Unauthorized bootleg copies of movies, music, games and software are prohibited.',
  { anyOf: ['bootleg dvd', 'bootleg dvds', 'bootleg blu-ray', 'bootleg blu ray', 'bootleg movie', 'bootleg movies', 'bootleg music', 'bootleg cd', 'bootleg cds', 'bootleg software', 'pirated software', 'pirated movies', 'pirated games'] });
add('Content used without permission', 'block',
  'This text explicitly describes use of protected listing content without permission. Use your own content, licensed content or an available eBay catalog alternative.',
  { allOf: ['without permission'], anyOf: ['copied product photos', 'copied product images', 'copied listing description', 'copyrighted artwork', 'copyrighted images'] });

for (const phrase of ['dupe', 'dupes', 'designer inspired', 'designer-inspired', 'replica', 'replicas', '1:1 copy', '1:1 quality', 'mirror quality']) {
  add(phrase, 'review', 'Possible imitation or authenticity claim. Check the exact product, any referenced brand, design and source evidence. Branded dupes and counterfeits are prohibited; legitimate replicas are not automatically prohibited.');
}
add('Fan-made protected artwork', 'review',
  'Fan-made or custom wording does not establish permission to reproduce protected characters or artwork. Verify rights for the exact design; do not copy this link into the lister until reviewed.',
  { anyOf: ['fan art', 'fan-art', 'fanart', 'fan made', 'fan-made', 'unofficial merchandise', 'unofficial merch'] });
// Two phrase groups require a compound rule per product family, not a blanket brand ban.
const characterNames = ['Disney', 'Pixar', 'Marvel', 'DC Comics', 'Pokemon', 'Pok\u00e9mon', 'Pikachu', 'Mickey Mouse', 'Harry Potter', 'Star Wars', 'Hello Kitty', 'Barbie', 'Funko'];
for (const product of ['sticker', 'stickers', 'decal', 'decals', 'shirt', 'shirts', 't-shirt', 'hoodie', 'mug', 'mugs', 'figurine', 'figure', 'toy', 'toys', 'plush', 'poster', 'patch', 'patches', 'keychain', 'costume', 'party supplies']) {
  add(`Character ${product} licensing`, 'review',
    'Named character or entertainment merchandise needs an authenticity and licensing check. Genuine authorized goods can be resold; this is a review signal, not a finding that all goods from this brand are prohibited.',
    { allOf: [product], anyOf: characterNames });
}
add('Named character designs', 'review',
  'A recognizable protected-character name raises a licensing or authenticity question for the exact design. Check source evidence and images; genuine authorized goods are not automatically prohibited.',
  { anyOf: ['Mickey Mouse', 'Minnie Mouse', 'Pikachu', 'Hello Kitty', 'Harry Potter', 'Darth Vader', 'Spider-Man', 'Spiderman', 'Super Mario', 'SpongeBob', 'Sponge Bob'] });
add('Character artwork and licensing claims', 'review',
  'A character-artwork or licensing claim needs evidence for the exact design. Words such as officially licensed do not establish permission on their own.',
  { anyOf: ['licensed character', 'character artwork', 'character logo', 'licensed artwork'] });
add('Sports and team logo merchandise', 'review',
  'Check licensing and authenticity of league or team merchandise. A logo or an official-looking title is not proof of authorization.',
  { anyOf: ['NFL jersey', 'NBA jersey', 'MLB jersey', 'NHL jersey', 'team logo', 'league logo', 'replica jersey', 'championship ring'] });
add('Replacement trademark badges and emblems', 'review',
  'Replacement badges, logos and emblems may reproduce protected trademarks. Verify the exact design and authorization, including logos visible only in photos.',
  { anyOf: ['replacement logo', 'replacement emblem', 'OEM emblem', 'car emblem', 'vehicle emblem', 'car badge', 'steering wheel badge', 'brand logo decal', 'designer logo'] });
add('Protected-brand imitation claims', 'review',
  'A designer or protected-brand imitation claim needs review. Ordinary inspiration, compatibility, OEM and warranty wording alone is not a violation.',
  { anyOf: ['designer inspired', 'designer-inspired', 'inspired by Gucci', 'inspired by Louis Vuitton', 'inspired by Chanel', 'factory original logo'] });

function key(rule) {
  return [rule.type, rule.value.toLowerCase(), ...( ['allOf', 'anyOf', 'noneOf'].map((field) => (rule[field] || []).map((v) => v.toLowerCase()).join(','))), rule.sourceType].join(':');
}

export function refreshIpPolicyPack() {
  const rulesPath = path.join(root, 'extension/listing-preflight-rules.json');
  const pack = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  // Replace superseded broad IP heuristics, including packs refreshed more than once.
  const superseded = new Set(['Authenticity and warranty claims', 'inspired by', 'inspired-by', 'AAA quality']);
  const currentDecisionNames = new Set(decisions.map((rule) => rule.value));
  const rules = new Map(pack.rules.filter((rule) =>
    !(rule.sourceType === 'official-ebay' && rule.type === 'keyword' && rule.value === 'compatible with')
    && !(rule.reviewedAt === reviewedAt && rule.policyTopic === 'Intellectual property and counterfeit items'
      && (superseded.has(rule.value) || currentDecisionNames.has(rule.value)))).map((rule) => [key(rule), rule]));
  for (const decision of decisions) {
    const signature = key(decision);
    rules.set(signature, { id: crypto.createHash('sha256').update(signature).digest('hex').slice(0, 20), ...decision });
  }
  pack.rules = [...rules.values()].sort((a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value));
  pack.ruleCount = pack.rules.length;
  pack.version = version;
  pack.generatedAt = new Date().toISOString();
  pack.clearancePolicy.version = version;
  // Only IP was re-reviewed today. Preserve the older full-hub review and expiry dates.
  pack.policyCoverage.ipReview = { reviewedAt, urls: [ipUrl, counterfeitUrl], addedDecisions: decisions.length };
  for (const relative of ['extension/listing-preflight-rules.json', 'product-hunter-extension/policy-rules.json']) {
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify(pack, null, 2)}\n`);
  }
  const researchPath = path.join(root, 'extension/product-research-output.json');
  const research = JSON.parse(fs.readFileSync(researchPath, 'utf8'));
  for (const source of research.sourceCoverage || []) {
    source.publishedRules = pack.rules.filter((rule) => rule.sourceType === source.sourceType).length;
  }
  research.generatedAt = pack.generatedAt;
  fs.writeFileSync(researchPath, `${JSON.stringify(research, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'evidence/listing-preflight/ip-policy-decisions-2026-09-13.json'), `${JSON.stringify({
    reviewedAt, sources: [ipUrl, counterfeitUrl],
    scope: 'Text-based IP risk screening. No claim of image inspection, authenticity verification or complete brand coverage. Conditional rules require human evidence review.',
    decisions
  }, null, 2)}\n`);
  return { version, rules: pack.ruleCount, ipDecisions: decisions.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(refreshIpPolicyPack());
