import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reviewedAt = '2026-09-13';
const version = '2026-09-13.3';
const policyUrl = 'https://www.ebay.com/help/policies/prohibited-restricted-items/fertilizer-pesticides-policy?id=4630';
const decisions = [];
const add = (value, anyOf, allOf = []) => decisions.push({
  id: crypto.createHash('sha256').update(`gldn-pesticides:${value}`).digest('hex').slice(0, 20),
  type: 'compound', value, anyOf, allOf, noneOf: [], action: 'block',
  reason: 'GLDN no-list rule: exclude this pesticide or pesticide-related product, including natural, organic, minimum-risk and EPA-registered versions. Do not copy it into the bulk lister. This operator restriction is stricter than eBay\'s conditional policy; inspect an existing listing before approving its removal.',
  policyTopic: 'GLDN pesticide prevention', evidenceKind: 'operator-no-list',
  reviewedBy: 'GLDN operations policy', reviewedAt, source: 'gldn-operator-reviewed',
  sourceType: 'gldn-operator', authority: 'GLDN Ops operator rule',
  operatorRuleId: 'GLDN-NO-PESTICIDES', evidenceUrls: [policyUrl]
});

add('Pesticide product classes and active ingredients', [
  'pesticide', 'insecticide', 'herbicide', 'fungicide', 'rodenticide', 'miticide', 'acaricide',
  'molluscicide', 'nematicide', 'larvicide', 'algaecide', 'algicide', 'biocide', 'germicide',
  'disinfectant', 'disinfecting', 'disinfection', 'sanitizer', 'sanitizing', 'sanitiser', 'sanitising',
  'sterilant', 'weed killer', 'weed preventer', 'weed control concentrate', 'bug bomb',
  'pest fogger', 'pesticidal', 'epa registration number', 'epa reg no', 'epa registered',
  'glyphosate', 'glufosinate', 'permethrin', 'cypermethrin', 'deltamethrin', 'bifenthrin',
  'pyrethrin', 'pyrethrum', 'azadirachtin', 'spinosad', 'imidacloprid', 'fipronil',
  'abamectin', 'bromadiolone', 'brodifacoum', 'difenacoum', 'metaldehyde', 'naphthalene',
  'paclobutrazol', 'indole butyric acid', 'indole 3 butyric acid', 'gibberellic acid'
]);
add('Plant growth and rooting treatments', [
  'plant growth regulator', 'plant regulator', 'growth retardant', 'rooting hormone',
  'rooting gel', 'rooting powder', 'rooting compound', 'rooting concentrate', 'rooting solution',
  'rooting liquid', 'root stimulator', 'root stimulant', 'defoliant', 'nitrogen stabilizer'
]);
add('Pool spa septic and water treatment chemicals', [
  'chlorine tablet', 'chlorine granule', 'chlorine pellet', 'chlorine dioxide',
  'bromine tablet', 'bromine granule', 'septic chlorine', 'pool chlorine', 'pool shock',
  'pool bromine', 'pool algaecide', 'spa shock', 'hot tub shock', 'pool chemical', 'spa chemical',
  'hot tub chemical', 'water purification tablet', 'water purification drop',
  'water disinfectant', 'water sanitizer'
]);
for (const oil of ['neem oil', 'peppermint oil', 'cedarwood oil', 'cedar oil']) {
  add(`${oil} plant and pest treatments`, [
    'plant', 'houseplant', 'garden', 'leaf shine', 'leaf spray', 'foliar', 'pest', 'rodent',
    'insect', 'flea', 'tick', 'mosquito', 'repellent', 'repelling', 'repels'
  ], [oil]);
}
add('Natural botanical pest products', [
  'insecticidal soap', 'horticultural oil', 'dormant oil spray', 'citronella candle',
  'citronella torch', 'mosquito dunk', 'mosquito bit', 'mothball', 'moth ball', 'moth crystal',
  'slug bait', 'snail bait', 'flea collar', 'tick collar', 'flea and tick', 'pest control spray',
  'pest control powder', 'pest control granule', 'pest control concentrate'
]);
const pests = ['insect', 'bug', 'ant', 'roach', 'cockroach', 'mosquito', 'flea', 'tick', 'bed bug',
  'bedbug', 'wasp', 'hornet', 'termite', 'mite', 'aphid', 'gnat', 'fruit fly', 'fly',
  'rodent', 'rat', 'mouse', 'mice', 'mole', 'vole', 'gopher', 'deer', 'rabbit', 'snake',
  'squirrel', 'raccoon', 'animal', 'pest', 'weed', 'algae', 'mold', 'mildew'];
add('Pest killing repelling bait and treatment products', pests.flatMap((pest) => [
  `${pest} killer`, `${pest} repellent`, `${pest} repelling`, `${pest} poison`,
  `${pest} bait`, `${pest} spray`, `${pest} treatment`, `${pest} control spray`,
  `kills ${pest}`, `kill ${pest}`, `repels ${pest}`, `repel ${pest}`
]));
// Separated claims catch "repels indoor rodents" and "kills 99.9% of bacteria".
const claimTargets = ['insect', 'mosquito', 'flea', 'tick', 'bed bug', 'bedbug', 'roach',
  'cockroach', 'ant', 'wasp', 'hornet', 'rodent', 'rat', 'mice', 'termite', 'aphid', 'gnat', 'bacteria', 'virus', 'germ',
  'mold', 'mildew', 'fungus', 'algae'];
for (const claim of ['kill', 'kills', 'killing', 'repel', 'repels', 'repelling', 'eliminates', 'destroys', 'prevents']) {
  add(`Pest and microbial ${claim} claims`, claimTargets, [claim]);
}
add('Antimicrobial cleaning formulations', ['spray', 'wipe', 'solution', 'concentrate', 'cleaner', 'liquid', 'powder'], ['antimicrobial']);
add('Antibacterial cleaning formulations', ['spray', 'wipe', 'solution', 'concentrate', 'cleaner', 'liquid'], ['antibacterial']);
add('Diatomaceous earth pest treatments', ['pest', 'insect', 'flea', 'tick', 'bed bug', 'roach', 'ant', 'killer'], ['diatomaceous earth']);
add('Boric acid pest treatments', ['pest', 'insect', 'roach', 'ant', 'bait', 'killer'], ['boric acid']);

export function refreshPesticidePolicyPack() {
  const pack = JSON.parse(fs.readFileSync(path.join(root, 'extension/listing-preflight-rules.json'), 'utf8'));
  pack.rules = pack.rules.filter((rule) => rule.operatorRuleId !== 'GLDN-NO-PESTICIDES').concat(decisions)
    .sort((a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value));
  pack.version = version;
  pack.ruleCount = pack.rules.length;
  pack.generatedAt = new Date().toISOString();
  pack.clearancePolicy.version = version;
  // This targeted review does not renew the date or expiry of unrelated policies.
  pack.policyCoverage.pesticideReview = { reviewedAt, urls: [policyUrl], operatorDecisions: decisions.length };
  for (const file of ['extension/listing-preflight-rules.json', 'product-hunter-extension/policy-rules.json']) {
    fs.writeFileSync(path.join(root, file), `${JSON.stringify(pack, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(root, 'evidence/listing-preflight/pesticide-decisions-2026-09-13.json'), `${JSON.stringify({
    reviewedAt, sources: [policyUrl, 'https://www.epa.gov/minimum-risk-pesticides/what-pesticide',
      'https://www.epa.gov/minimum-risk-pesticides/conditions-minimum-risk-pesticides'],
    scope: 'User-directed no-pesticide rule, not an assertion that eBay bans every registered pesticide. Includes observed removal families: botanical plant spray, septic chlorine, rooting gel and toy disinfectant. No account identifiers are published.',
    limits: 'Text screening cannot prove ingredients or read uncollected image text. Ordinary tools, empty containers, nutrition-only fertilizers and unclaimed cosmetic oils are not pesticide evidence alone.',
    decisions
  }, null, 2)}\n`);
  const researchPath = path.join(root, 'extension/product-research-output.json');
  const research = JSON.parse(fs.readFileSync(researchPath, 'utf8'));
  research.generatedAt = pack.generatedAt;
  for (const source of research.sourceCoverage || []) {
    source.publishedRules = pack.rules.filter((rule) => rule.sourceType === source.sourceType).length;
  }
  fs.writeFileSync(researchPath, `${JSON.stringify(research, null, 2)}\n`);
  return { version, rules: pack.ruleCount, pesticideDecisions: decisions.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(refreshPesticidePolicyPack());
