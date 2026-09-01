import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const extensionRulesPath = path.join(root, 'extension', 'listing-preflight-rules.json');
const hunterRulesPath = path.join(root, 'product-hunter-extension', 'policy-rules.json');
const evidencePath = path.join(root, 'evidence', 'listing-preflight', 'official-ebay-policy-hub-decisions-2026-08-31.json');
const researchPath = path.join(root, 'extension', 'product-research-output.json');
const reviewedAt = '2026-08-31';
const hubUrl = 'https://www.ebay.com/help/policies/prohibited-restricted-items/prohibited-restricted-items?id=4207';

const pages = [
  ['Adult items policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/adult-items-policy?id=4278'],
  ['Airsoft, air rifles and BB guns policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/airsoft-air-rifles-bb-guns-policy?id=5045'],
  ['Alcohol policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/alcohol-policy?id=4274'],
  ['Animal products policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/animal-products-policy?id=5046'],
  ['Animal traps policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/animal-traps-policy?id=5040'],
  ['Art policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/art-policy?id=4284'],
  ['Artifacts and cave formations policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/artifacts-cave-formations-policy?id=4282'],
  ['Beta and OEM software policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/beta-oem-software-policy?id=4288'],
  ['Chance listings policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/chance-listings-policy?id=4311'],
  ['Charity listings policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/charity-listings-policy?id=4286'],
  ['Collectible currency policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/collectible-currency-policy?id=4337'],
  ['Compilations of information policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/compilations-information-policy?id=4313'],
  ['Cosmetics and perfume policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/cosmetics-policy?id=4290'],
  ['Counterfeit item policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/counterfeit-item-policy?id=4276'],
  ['Coupons policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/coupons-policy?id=4292'],
  ['Credit and debit card policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/credit-debit-cards-policy?id=4317'],
  ['Custom printed products policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/custom-printed-products-policy?id=5593'],
  ['Disaster and tragedy policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/disaster-tragedy-policy?id=5051'],
  ['Electronic equipment policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/electronic-equipment-policy?id=4302'],
  ['Electronically delivered items policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/electronically-delivered-items-policy?id=4289'],
  ['Embargoed goods policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/embargoed-goods-policy?id=4323'],
  ['Emissions control defeat devices policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/emissions-control-defeat-devices-policy?id=5383'],
  ['Encouraging illegal activity policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/encouraging-illegal-activity-policy?id=4339'],
  ['Event tickets policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/event-tickets-policy?id=4309'],
  ['Fertilizer and pesticides policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/fertilizer-pesticides-policy?id=4630'],
  ['Firearms and accessories policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/firearms-accessories-policy?id=4277'],
  ['Food policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/food-policy?id=4295'],
  ['Funeral items policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/funeral-items-policy?id=5052'],
  ['Gift cards policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/gift-cards-policy?id=4294'],
  ['Government items policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/government-items-policy?id=4318'],
  ['Hazardous materials policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/hazardous-materials-policy?id=4335'],
  ['Human body parts policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/human-body-parts-policy?id=4325'],
  ['Illegal drugs and drug paraphernalia policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/illegal-drugs-drug-paraphernalia-policy?id=4333'],
  ['Illegal explicit content policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/illegal-explicit-content-policy?id=5053'],
  ['Intangible items policy', 'https://www.ebay.com/help/policies/listing-policies/intangible-items-policy?id=5038'],
  ['International trading policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/international-trading-policy?id=4338'],
  ['Jewelry policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/jewelry-policy?id=4280'],
  ['Knives policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/knives-policy?id=5047'],
  ['Live animals policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/live-animals-policy?id=4327'],
  ['Lockpicking devices policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/lockpicking-devices-policy?id=4329'],
  ['Lottery tickets policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/lottery-tickets-policy?id=4635'],
  ['Medical devices policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/medical-devices-policy?id=4322'],
  ['Military items policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/military-items-policy?id=4342'],
  ['Offensive material policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/offensive-materials-policy?id=4324'],
  ['Personal information policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/personal-information-policy?id=4297'],
  ['Pill press, die and mold policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/pill-press-die-mold-policy?id=5463'],
  ['Plants and seeds policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/plants-seeds-policy?id=4287'],
  ['Police-related items policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/policerelated-items-policy?id=4319'],
  ['Prescription and over-the-counter drugs policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/prescription-overthecounter-drugs-policy?id=5048'],
  ['Price gouging policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/price-gouging-policy?id=5106'],
  ['Product safety policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/product-safety-policy?id=4300'],
  ['Products with eligibility requirements policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/products-eligibility-requirements-policy?id=5271'],
  ['Prohibited adult items policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/prohibited-adult-items-policy?id=5055'],
  ['Protecting minors policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/protecting-minors-policy?id=5057'],
  ['Real estate policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/real-estate-policy?id=4304'],
  ['Replica, toy, and prop firearms policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/replica-toy-prop-firearms-policy?id=5049'],
  ['Reporting non-consensual intimate images', 'https://www.ebay.com/help/policies/prohibited-restricted-items/reporting-nonconsensual-intimate-images?id=5836'],
  ['Selling art policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/selling-art-policy?id=4284'],
  ['Services policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/services-policy?id=4326'],
  ['Slot machines policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/slot-machines-policy?id=4312'],
  ['Social media and reviews manipulation policy', 'https://www.ebay.com/help/policies/listing-policies/social-media-reviews-manipulation-policy?id=5031'],
  ['Stocks and securities policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/stocks-other-securities-policy?id=4321'],
  ['Stolen property policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/stolen-property-policy?id=4334'],
  ['Tobacco and e-cigarettes policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/tobacco-ecigarettes-policy?id=4273'],
  ['Travel policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/travel-policy?id=4279'],
  ['Used clothing policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/used-clothing-policy?id=4281'],
  ['Vehicle, parts and accessories policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/vehicle-parts-accessories-policy?id=4293'],
  ['Violence and violent criminals policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/violence-violent-criminals-policy?id=5056'],
  ['Virtual currency policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/virtual-currency-policy?id=5044'],
  ['Weapons policy', 'https://www.ebay.com/help/policies/prohibited-restricted-items/weapons-policy?id=5050']
].map(([title, url]) => ({ title, url, handling: 'reviewed-for-text-signals' }));

const ipUrl = 'https://www.ebay.com/help/policies/listing-policies/selling-policies/intellectual-property-vero-program?id=4349';
const counterfeitUrl = pages.find((page) => page.title === 'Counterfeit item policy').url;
const urlFor = (title) => pages.find((page) => page.title === title)?.url || hubUrl;
const decisions = [];

function addRule({ value, action, topic, url, reason, type = 'keyword', allOf = [], anyOf = [], noneOf = [], evidenceKind }) {
  decisions.push({
    type,
    value,
    allOf,
    anyOf,
    noneOf,
    decision: action,
    reason,
    policyTopic: topic,
    evidenceKind: evidenceKind || (action === 'block' ? 'explicit-prohibition' : 'conditional-review'),
    reviewedBy: 'GLDN official eBay policy review',
    reviewedAt,
    sourceType: 'official-ebay',
    evidenceUrls: Array.isArray(url) ? url : [url]
  });
}

function addKeywords(topic, url, action, values, reason) {
  for (const value of values) addRule({ value, action, topic, url, reason });
}

function addOperatorRule({ operatorRuleId, value, anyOf, url, reason }) {
  decisions.push({
    type: 'compound',
    value,
    anyOf,
    decision: 'block',
    reason,
    policyTopic: 'GLDN no-list rule',
    evidenceKind: 'operator-no-list',
    reviewedBy: 'GLDN operations policy',
    reviewedAt,
    source: 'gldn-operator-reviewed',
    sourceType: 'gldn-operator',
    authority: 'GLDN Ops operator rule',
    operatorRuleId,
    evidenceUrls: Array.isArray(url) ? url : [url]
  });
}

const highRiskBrands = [
  'adidas', 'apple', 'beats', 'bose', 'burberry', 'chanel', 'coach', 'crocs', 'dewalt',
  'dior', 'disney', 'dyson', 'funko', 'gucci', 'jbl', 'lego', 'louis vuitton', 'makita',
  'marvel', 'michael kors', 'milwaukee', 'nike', 'nintendo', 'pokemon', 'prada', 'rolex',
  'samsung', 'sony', 'stanley', 'ugg', 'yeti'
];

addRule({
  type: 'compound', value: 'explicit counterfeit product language', allOf: ['counterfeit'],
  noneOf: ['detector', 'detection', 'tester', 'marker pen', 'uv light', 'training guide'],
  action: 'block', topic: 'Counterfeit and intellectual property', url: [counterfeitUrl, ipUrl],
  reason: 'eBay prohibits counterfeit or fake products. The exclusion list prevents legitimate counterfeit-detection products from being auto-blocked.'
});
addRule({
  type: 'compound', value: 'bootleg protected media', allOf: ['bootleg'],
  anyOf: ['recording', 'concert', 'dvd', 'cd', 'movie', 'music', 'software', 'game', 'film', 'show'],
  action: 'block', topic: 'Counterfeit and intellectual property', url: [counterfeitUrl, ipUrl],
  reason: 'eBay prohibits bootleg recordings and unauthorized copies of protected media or software.'
});
for (const signal of ['dupe', 'inspired by', 'replica', 'fake']) {
  addRule({
    type: 'compound', value: `${signal} plus protected brand`, allOf: [signal], anyOf: highRiskBrands,
    action: 'block', topic: 'Counterfeit and intellectual property', url: [counterfeitUrl, ipUrl],
    reason: `eBay prohibits branded ${signal} language that represents an unauthorized imitation or creates a false brand association.`
  });
}
addKeywords('Counterfeit and intellectual property', [counterfeitUrl, ipUrl], 'block', [
  'bootleg recording', 'bootleg dvd', 'bootleg software', 'burned dvd', 'burned cd',
  'unauthorized copy', 'unauthorized reprint', 'pirated software', 'cracked software',
  'fake forever stamp', 'fake postage stamp', 'counterfeit stamp', 'unauthorized logo'
], 'eBay prohibits unauthorized copies, reprints, bootlegs, counterfeit stamps, and unauthorized brand or logo use.');
addKeywords('Counterfeit and intellectual property', [counterfeitUrl, ipUrl], 'review', [
  'designer handbag', 'luxury handbag', 'luxury watch', 'brand name perfume', 'designer perfume',
  'sports jersey', 'team jersey', 'sneakers', 'trading card', 'gold bullion', 'silver bullion',
  'forever stamps', 'software license key', 'wireless earbuds', 'branded charger', 'branded cable',
  'preloaded games', 'preloaded movies', 'preloaded music', 'certificate of authenticity'
], 'This product type has elevated authenticity, trademark, copyright, or documentation risk. Confirm the exact source and retain acceptable authenticity evidence before listing.');

addKeywords('Adult items policy', urlFor('Adult items policy'), 'block', [
  'sexually explicit dvd', 'sexually explicit magazine', 'xxx adult dvd', 'adults only video game'
], 'eBay does not allow sexually explicit media or Adults Only video games.');
addKeywords('Adult items policy', urlFor('Adult items policy'), 'review', [
  'sex toy', 'adult magazine', 'nude art'
], 'Adult products are allowed only in limited categories and conditions and may require seller pre-approval, new condition, original packaging, and compliant images.');
addKeywords('Airsoft, air rifles and BB guns policy', urlFor('Airsoft, air rifles and BB guns policy'), 'review', [
  'airsoft gun', 'air rifle', 'air pistol', 'bb gun', 'pellet gun'
], 'Air guns require seller standing, caliber, category, shipping, disclaimer, and orange-plug checks that text scanning cannot prove.');
addKeywords('Alcohol policy', urlFor('Alcohol policy'), 'block', [
  'bottle of whiskey', 'bottle of vodka', 'bottle of rum', 'bottle of tequila', 'bottle of bourbon', 'bottle of gin'
], 'Only eBay-approved wine sellers may list wine; other alcohol products are prohibited.');
addKeywords('Animal products policy', urlFor('Animal products policy'), 'block', [
  'bear claw', 'bear gallbladder', 'bat specimen', 'marine mammal bone', 'orca tooth', 'sperm whale tooth',
  'migratory bird nest', 'sea turtle shell'
], 'eBay prohibits specified protected-animal products and items from endangered or threatened species.');
addKeywords('Animal traps policy', urlFor('Animal traps policy'), 'block', [
  'toothed leg hold trap', 'toothed foothold trap'
], 'eBay prohibits bear traps and toothed leghold or foothold traps.');
addKeywords('Art and artifacts policies', [urlFor('Art policy'), urlFor('Selling art policy'), urlFor('Artifacts and cave formations policy')], 'review', [
  'signed original art', 'attributed to artist', 'art reproduction', 'replica painting', 'certificate of authenticity',
  'ancient artifact', 'archaeological artifact', 'cave formation', 'grave marker'
], 'Art and artifacts require accurate attribution, authorization, authenticity, provenance, ownership, and protected-land or cultural-property checks.');
addKeywords('Art and intellectual property', [urlFor('Art policy'), urlFor('Selling art policy'), ipUrl], 'block', [
  'unauthorized art reproduction', 'unlicensed art reproduction', 'unauthorized replica painting'
], 'eBay prohibits unauthorized art reproductions and replicas that infringe intellectual-property rights.');
addKeywords('Beta and OEM software policy', urlFor('Beta and OEM software policy'), 'block', [
  'beta software', 'beta activation key', 'beta access code'
], 'eBay prohibits beta software, beta keys, and beta access codes.');
addKeywords('Beta and OEM software policy', urlFor('Beta and OEM software policy'), 'review', [
  'oem software', 'recovery disc', 'restore disc'
], 'OEM software is restricted and generally must accompany the original hardware.');
addKeywords('Chance and lottery listings', [urlFor('Chance listings policy'), urlFor('Lottery tickets policy')], 'block', [
  'raffle ticket', 'sweepstakes coupon', 'lottery ticket', 'random drawing entry', 'chance to win', 'game piece code'
], 'eBay prohibits listings that offer a chance to win and generally prohibits lottery tickets, game pieces, sweepstakes coupons, raffles, and drawings.');
addKeywords('Chance listings policy', urlFor('Chance listings policy'), 'review', [
  'mystery box', 'mystery bundle', 'random assortment'
], 'Chance listings require all contents and minimum value to be disclosed; random-outcome language needs manual review.');
addKeywords('Charity listings policy', urlFor('Charity listings policy'), 'review', [
  'proceeds donated to charity', 'charity fundraiser'
], 'Charity claims must use eBay for Charity and accurately state the donation.');
addKeywords('Collectible currency policy', urlFor('Collectible currency policy'), 'review', [
  'ungraded currency', 'raw banknote', 'replica coin', 'copy coin'
], 'Currency listings have grading, replica, and disclosure requirements that need manual verification.');
addKeywords('Compilations and personal information', [urlFor('Compilations of information policy'), urlFor('Personal information policy')], 'block', [
  'email address list', 'customer contact list', 'mailing list database', 'social security numbers', 'account passwords'
], 'eBay prohibits personal information, account credentials, contact lists, and data used for unsolicited marketing.');
addKeywords('Cosmetics and perfume policy', urlFor('Cosmetics and perfume policy'), 'block', [
  'used perfume', 'opened perfume', 'used cosmetic', 'opened cosmetic', 'tester perfume without cap', 'repackaged cosmetic'
], 'eBay prohibits used cosmetics and perfume, decanted products, and products without required original packaging or applicators.');
addKeywords('Cosmetics and perfume policy', urlFor('Cosmetics and perfume policy'), 'review', [
  'perfume tester', 'cosmetic tester', 'skin whitening cream'
], 'Cosmetics and perfumes require original packaging, lawful ingredients, and authenticity checks.');
addKeywords('Coupons policy', urlFor('Coupons policy'), 'block', [
  'free product coupon', 'scanned coupon', 'digital coupon file', 'expired coupon'
], 'eBay prohibits free-product, scanned, electronically delivered, recalled, and expired coupons.');
addKeywords('Credit, debit, and gift cards', [urlFor('Credit and debit card policy'), urlFor('Gift cards policy')], 'review', [
  'gift card', 'store credit receipt'
], 'Gift cards and store credit are restricted by card type, amount, format, and quantity and require manual verification.');
addKeywords('Custom printed products and intellectual property', [urlFor('Custom printed products policy'), ipUrl], 'review', [
  'custom logo shirt', 'custom character shirt', 'celebrity photo shirt', 'fan art print'
], 'Custom products may not use protected logos, characters, photos, artwork, or identities without authorization.');
addKeywords('Disaster and tragedy policy', urlFor('Disaster and tragedy policy'), 'review', [
  'disaster souvenir', 'tragedy souvenir', 'mass shooting souvenir'
], 'Listings may not attempt to profit from or glorify human tragedy or disaster.');
addKeywords('Electronic equipment policy', urlFor('Electronic equipment policy'), 'block', [
  'disguised surveillance camera', 'wifi jammer', 'bluetooth jammer', 'cellular jammer', 'radar scrambler',
  'traffic signal changer', 'traffic light changer'
], 'eBay prohibits signal jammers, disguised surveillance devices, unauthorized transmitters, and traffic-control devices.');
addKeywords('Electronically delivered items policy', urlFor('Electronically delivered items policy'), 'block', [
  'emailed software key', 'digital movie code only', 'detached movie code', 'download account credentials'
], 'Unauthorized software keys, detached media codes, and account credentials are prohibited.');
for (const region of ['cuba', 'north korea', 'iran', 'syria', 'crimea', 'donetsk', 'luhansk', 'kherson', 'zaporizhzhia']) {
  addRule({ type: 'compound', value: `goods sourced from ${region}`, allOf: ['made in'], anyOf: [region], action: 'block', topic: 'Embargoed goods policy', url: urlFor('Embargoed goods policy'), reason: `eBay prohibits goods sourced from embargoed countries or regions, including ${region}.` });
}
addRule({ type: 'compound', value: 'Russian sourced diamond', allOf: ['diamond'], anyOf: ['russian', 'russia'], action: 'block', topic: 'Embargoed goods policy', url: urlFor('Embargoed goods policy'), reason: 'eBay prohibits natural and lab-grown diamonds sourced from Russia.' });
addKeywords('Emissions control defeat devices policy', urlFor('Emissions control defeat devices policy'), 'block', [
  'dpf delete', 'catalytic converter delete', 'scr delete', 'def delete', 'oxygen sensor bypass',
  'start stop disabler', 'exhaust flame kit', 'exhaust servo eliminator', 'race only tuner', 'off road only tuner'
], 'eBay prohibits products that bypass, defeat, delete, or render vehicle emissions controls inoperative.');
addKeywords('Encouraging illegal activity policy', urlFor('Encouraging illegal activity policy'), 'block', [
  'bomb making instructions', 'drug making instructions', 'fake drug test urine', 'usps shipping supplies for resale'
], 'eBay prohibits products or information that enable illegal activity and prohibits resale of USPS shipping materials.');
addKeywords('Event tickets policy', urlFor('Event tickets policy'), 'review', [
  'event ticket', 'concert ticket', 'sports ticket'
], 'Ticket listings depend on possession, jurisdiction, authorization, pricing, and event-specific restrictions.');
addKeywords('Fertilizer and pesticides policy', urlFor('Fertilizer and pesticides policy'), 'review', [
  'pool chlorine', 'pool shock', 'disinfectant concentrate', 'insect repellent', 'flea collar', 'plant growth regulator'
], 'Pesticide-related products require EPA registration, intact branded packaging, US location, and sometimes seller pre-approval.');
addOperatorRule({
  operatorRuleId: 'GLDN-NO-PESTICIDES',
  value: 'all pesticide products',
  anyOf: [
    'pesticide', 'insecticide', 'herbicide', 'fungicide', 'rodenticide', 'miticide', 'molluscicide',
    'algaecide', 'biocide', 'germicide', 'weed killer', 'weed preventer', 'insect killer', 'bug killer',
    'ant killer', 'roach killer', 'wasp killer', 'hornet killer', 'mosquito killer', 'rat poison',
    'mouse poison', 'rodent poison', 'ant bait', 'roach bait', 'flea collar', 'flea and tick',
    'flea & tick', 'tick repellent', 'insect repellent', 'mosquito repellent', 'plant growth regulator',
    'pool chlorine', 'pool shock', 'pool algaecide', 'pool bromine', 'water purification tablet',
    'disinfectant', 'disinfecting', 'sanitizer', 'sanitizing', 'pest control spray', 'pest fogger', 'bug bomb'
  ],
  url: urlFor('Fertilizer and pesticides policy'),
  reason: 'GLDN Ops does not permit any pesticide product to be posted to eBay. This operator rule is stricter than eBay\'s conditional pesticide policy and intentionally blocks registered products too.'
});
addKeywords('Firearms and accessories policy', urlFor('Firearms and accessories policy'), 'block', [
  'complete firearm', 'handgun for sale', 'rifle for sale', 'shotgun for sale', 'firearm frame', 'firearm lower receiver',
  'silencer baffle', 'suppressor baffle', 'machine gun conversion', 'glock switch', 'large capacity magazine'
], 'eBay prohibits firearms, frames or receivers, silencers or suppressors, conversion devices, ammunition, and high-capacity magazines.');
addKeywords('Food policy', urlFor('Food policy'), 'block', [
  'unpasteurized cheese', 'raw milk cheese', 'ebt eligible food', 'snap eligible food'
], 'eBay prohibits specified unsafe foods and food offered for government-benefit payment.');
addKeywords('Food policy', urlFor('Food policy'), 'review', [
  'wild foraged mushroom', 'home canned food', 'perishable food'
], 'Food may require safety, packaging, expiration, and shipping review.');
addKeywords('Funeral items policy', urlFor('Funeral items policy'), 'block', [
  'used funeral urn', 'used burial urn', 'used headstone', 'used grave marker'
], 'eBay prohibits used urns, headstones, and grave markers.');
addKeywords('Government items policy', urlFor('Government items policy'), 'block', [
  'fake passport', 'blank passport', 'drivers license template', 'government id template', 'current license plate',
  'postage meter ink', 'tax meter', 'voting equipment', 'official transit uniform'
], 'eBay prohibits specified government documents, identification, property, voting equipment, meters, and current plates.');
addKeywords('Hazardous materials policy', urlFor('Hazardous materials policy'), 'block', [
  'black powder explosive', 'thermite powder', 'firework mortar shell', 'road flare bundle', 'radioactive sample',
  'mercury switch', 'ozone depleting refrigerant'
], 'eBay generally prohibits explosives, explosive precursors, radioactive materials, corrosives, poisons, and other hazardous materials.');
addOperatorRule({
  operatorRuleId: 'GLDN-NO-AEROSOL-SPRAY-CANS',
  value: 'all aerosol and pressurized spray cans',
  anyOf: [
    'aerosol', 'spray can', 'spray cans', 'pressurized spray', 'canned air', 'compressed air can',
    'air duster', 'compressed gas duster', 'spray paint', 'spray enamel', 'spray primer', 'spray lacquer',
    'spray varnish', 'spray adhesive', 'spray lubricant', 'spray grease', 'spray foam', 'cooking spray',
    'hair spray', 'hairspray', 'spray deodorant', 'spray sunscreen', 'spray starch',
    'spray air freshener', 'body spray can'
  ],
  url: urlFor('Hazardous materials policy'),
  reason: 'GLDN Ops does not permit any aerosol or pressurized spray can to be posted to eBay. This operator rule is stricter than eBay\'s carrier-dependent hazardous-material policy.'
});
addKeywords('Human body parts policy', urlFor('Human body parts policy'), 'block', [
  'human skull', 'human bone', 'human organ', 'human blood', 'human tissue specimen'
], 'eBay prohibits human body parts and products made from the human body, except scalp hair.');
addKeywords('Illegal drugs and drug paraphernalia policy', urlFor('Illegal drugs and drug paraphernalia policy'), 'block', [
  'marijuana edible', 'cannabis edible', 'thc vape', 'drug pipe', 'bong for marijuana', 'nitrous oxide charger'
], 'eBay prohibits controlled substances, drug-like substances, paraphernalia, and nitrous-oxide chargers.');
addKeywords('Illegal explicit content and protecting minors', [urlFor('Illegal explicit content policy'), urlFor('Protecting minors policy')], 'block', [
  'child sexual content', 'bestiality video', 'snuff film', 'rape video', 'non consensual intimate image', 'sexualized child doll'
], 'eBay prohibits illegal explicit content, non-consensual intimate images, and sexualized depictions or products involving minors.');
addKeywords('Prohibited adult items policy', urlFor('Prohibited adult items policy'), 'block', [
  'animal sex toy', 'bestiality sex toy', 'hidden camera adult video', 'amateur hidden camera adult content',
  'digital adult content', 'adult club membership'
], 'eBay prohibits specified adult items, including animal-simulating sex toys, unauthorized hidden-camera adult content, digitally delivered adult content, and adult-club memberships.');
addKeywords('Non-consensual intimate imagery', urlFor('Reporting non-consensual intimate images'), 'block', [
  'non-consensual intimate image', 'non consensual intimate image', 'revenge porn', 'hidden camera intimate video',
  'intimate deepfake', 'deepfake nude'
], 'eBay prohibits intimate imagery shared without consent, including hidden-camera, altered, fabricated, and deepfake content.');
addKeywords('Intangible items policy', urlFor('Intangible items policy'), 'block', [
  'ghost in a bottle', 'soul for sale', 'spell casting service', 'haunted spirit service'
], 'eBay prohibits listings whose only value is an intangible ghost, soul, spell, or similar claim.');
addKeywords('International trading policy', urlFor('International trading policy'), 'review', [
  'export controlled', 'export restricted', 'import restricted', 'itar controlled', 'dual use technology',
  'night vision equipment', 'military thermal imaging'
], 'International listings require destination-specific import, export, licensing, and shipping review; text scanning cannot establish lawful cross-border sale.');
addKeywords('Jewelry policy', urlFor('Jewelry policy'), 'review', [
  'lab grown diamond', 'treated diamond', 'simulated diamond', 'gold plated jewelry', 'sterling silver jewelry'
], 'Jewelry listings require accurate material, treatment, grade, weight, and origin disclosures.');
addKeywords('Knives policy', urlFor('Knives policy'), 'block', [
  'automatic knife', 'butterfly knife', 'balisong knife', 'gravity knife', 'out the front knife', 'otf knife',
  'push dagger', 'switchblade knife', 'sword cane', 'belt buckle knife', 'credit card knife'
], 'eBay prohibits automatic, butterfly, gravity, OTF, push, switchblade, and disguised knives.');
addRule({ type: 'compound', value: 'live pet or animal', allOf: ['live'], anyOf: ['dog', 'cat', 'bird', 'reptile', 'snake', 'turtle', 'fish', 'rabbit', 'hamster'], action: 'block', topic: 'Live animals policy', url: urlFor('Live animals policy'), reason: 'Pets and most live animals are not allowed on eBay.' });
addKeywords('Lockpicking devices policy', urlFor('Lockpicking devices policy'), 'block', [
  'lock pick gun', 'lock pick tool', 'auto jiggler key', 'tubular lock pick'
], 'eBay prohibits lockpicking and locksmithing devices, bump keys, slim jims, and key-duplication tools.');
addKeywords('Medical devices policy', urlFor('Medical devices policy'), 'block', [
  'bone growth stimulator', 'osseodensification bur', 'heated cpap tubing', 'cpap humidifier', 'glucose monitor prescription',
  'implantable heart valve', 'vascular graft', 'infusion pump implantable', 'oxygen conserver', 'prescription pulse oximeter'
], 'eBay prohibits prescription medical devices and specified equipment that can be abused for unlawful purposes.');
addKeywords('Military items policy', urlFor('Military items policy'), 'block', [
  'live grenade', 'demilitarized grenade', 'land mine', 'missile launcher', 'sapi plate military', 'itar technical data'
], 'eBay prohibits explosives, military ordnance, military-only items, specified military body armor, and controlled technical data.');
addKeywords('Offensive material and violent criminals policies', [urlFor('Offensive material policy'), urlFor('Violence and violent criminals policy')], 'block', [
  'nazi propaganda', 'confederate battle flag', 'terrorist organization merchandise', 'serial killer fan merchandise', 'mass shooter merchandise'
], 'eBay prohibits material that promotes hatred, terrorism, violent criminals, or glorifies violence.');
addKeywords('Personal information policy', urlFor('Personal information policy'), 'block', [
  'buy instagram followers', 'buy social media likes', 'email harvesting software', 'spam email software'
], 'eBay prohibits personal information, social engagement, and tools for spam or harvesting contact details.');
addKeywords('Pill press, die and mold policy', urlFor('Pill press, die and mold policy'), 'block', [
  'pill press machine', 'tablet press machine', 'capsule filling machine commercial', 'pill press die', 'tablet press mold'
], 'eBay prohibits pill presses, tablet machines, encapsulating machines, and related dies, molds, and parts.');
addKeywords('Plants and seeds policy', urlFor('Plants and seeds policy'), 'review', [
  'live plant', 'plant seeds', 'fruit tree cutting', 'invasive plant', 'endangered seeds'
], 'Plants and seeds depend on species, origin, destination, and government or shipping restrictions.');
addKeywords('Police-related items policy', urlFor('Police-related items policy'), 'block', [
  'current police uniform', 'current fire department uniform', 'police light bar', 'emergency vehicle siren', 'replica police badge'
], 'eBay prohibits current police or emergency uniforms, badges, emergency lights, sirens, and specified accessories.');
addKeywords('Prescription and over-the-counter drugs policy', urlFor('Prescription and over-the-counter drugs policy'), 'block', [
  'prescription strength cream', 'human growth hormone', 'injectable medication', 'heartworm medication prescription', 'hydrogen peroxide 35 percent'
], 'eBay prohibits prescription drugs, prescription-strength products, injectable substances, and specified regulated medications.');
addKeywords('Prescription and over-the-counter drugs policy', urlFor('Prescription and over-the-counter drugs policy'), 'review', [
  'otc medicine', 'herbal remedy', 'pet medication', 'vitamin supplement'
], 'OTC drugs, supplements, vitamins, and veterinary products require intact packaging, lawful ingredients, expiration, and compliant claims.');
addKeywords('Price gouging policy', urlFor('Price gouging policy'), 'review', [
  'n95 respirator', 'emergency drinking water', 'emergency food supply', 'baby formula', 'hand sanitizer bulk',
  'disaster generator', 'emergency medical supplies'
], 'Essential goods can be restricted during emergencies and must be offered at reasonable prices; the extension cannot determine fair pricing from product text alone.');
addKeywords('Product safety policy', urlFor('Product safety policy'), 'review', [
  'recalled product', 'consumer product recall', 'hoverboard', 'electric scooter', 'e-bike battery', 'water beads toy', 'button battery toy'
], 'Product safety depends on current recalls, certifications, condition, battery access, and product-specific requirements.');
addKeywords('Products with eligibility requirements policy', urlFor('Products with eligibility requirements policy'), 'review', [
  'drone', 'thermal imaging camera', 'laser pointer', 'car diagnostic scanner'
], 'This product category may require seller eligibility, location, certification, or category-specific requirements.');
addKeywords('Replica, toy, and prop firearms policy', urlFor('Replica, toy, and prop firearms policy'), 'review', [
  'replica gun', 'toy gun', 'prop firearm', 'airsoft pistol', 'airsoft rifle'
], 'Replica, toy, prop, and airsoft guns require permanent blaze-orange markings and other conditions that must be visually verified.');
addKeywords('Real estate policy', urlFor('Real estate policy'), 'block', [
  'undivided interest in land', 'partial interest in real estate'
], 'eBay prohibits selling an undivided or partial interest in a land real-estate property, except qualifying mineral rights.');
addKeywords('Real estate policy', urlFor('Real estate policy'), 'review', [
  'real estate listing', 'property for sale', 'mortgage note for sale', 'land for sale'
], 'Real-estate advertising has format, ownership, licensing, disclosure, privacy, and category conditions requiring specialist review.');
addKeywords('Services policy', urlFor('Services policy'), 'review', [
  'service for sale', 'installation service', 'repair service', 'consulting service'
], 'Services are allowed only in specific formats and categories and must not enable prohibited activity.');
addKeywords('Slot machines policy', urlFor('Slot machines policy'), 'review', [
  'working slot machine', 'casino slot machine', 'slot machine parts'
], 'Slot machines depend on function, age, and buyer/seller jurisdiction and require manual review.');
addKeywords('Social media and reviews manipulation policy', urlFor('Social media and reviews manipulation policy'), 'block', [
  'buy product reviews', 'positive review service', 'review manipulation service', 'buy youtube subscribers', 'buy tiktok followers'
], 'eBay prohibits selling reviews, likes, followers, subscribers, and review-manipulation services.');
addKeywords('Stocks and securities policy', urlFor('Stocks and securities policy'), 'review', [
  'stock certificate', 'single share stock gift', 'investment security'
], 'Most stocks and securities are prohibited; narrow collectible and gift exceptions require manual verification.');
addKeywords('Stolen property policy', urlFor('Stolen property policy'), 'review', [
  'police evidence property', 'unclaimed cargo', 'lost mail package'
], 'Ownership and lawful source must be verified because stolen or unauthorized company or government property is prohibited.');
addKeywords('Tobacco and e-cigarettes policy', urlFor('Tobacco and e-cigarettes policy'), 'block', [
  'cigarette pack', 'cigar box full', 'loose tobacco', 'herbal cigarette', 'shisha tobacco', 'e-cigarette part', 'vape accessory'
], 'eBay prohibits tobacco, herbal cigarettes, e-cigarettes, e-liquids, their parts and accessories, and nicotine pouches.');
addKeywords('Travel policy', urlFor('Travel policy'), 'review', [
  'travel certificate', 'travel club membership', 'vacation package', 'hotel voucher', 'airline voucher'
], 'Travel listings depend on ownership, authorization, licensing, destination, fees, and provider rules.');
addKeywords('Used clothing policy', urlFor('Used clothing policy'), 'block', [
  'used underwear', 'preowned underwear', 'used socks', 'preowned socks'
], 'eBay prohibits used underwear and used socks.');
addKeywords('Vehicle, parts and accessories policy', urlFor('Vehicle, parts and accessories policy'), 'review', [
  'used airbag', 'salvage airbag', 'vehicle title service', 'odometer correction tool'
], 'Vehicle items can depend on safety, title, odometer, airbag, emissions, and documentation requirements.');
addKeywords('Virtual currency policy', urlFor('Virtual currency policy'), 'review', [
  'bitcoin for sale', 'cryptocurrency mining contract', 'nft token', 'crypto wallet with funds'
], 'Virtual currency and related products have category, format, ownership, and delivery restrictions.');
addKeywords('Weapons policy', urlFor('Weapons policy'), 'block', [
  'brass knuckles', 'metal knuckles', 'slapjack weapon', 'sap weapon', 'throwing star', 'nunchaku', 'blowgun', 'exploding target'
], 'eBay prohibits most weapons, including knuckles, saps, throwing stars, nunchaku, blowguns, and exploding targets.');
addKeywords('Weapons policy', urlFor('Weapons policy'), 'review', [
  'crossbow', 'slingshot', 'sword', 'machete', 'baton'
], 'Weapons that may be allowed still require category, design, shipping, and jurisdiction review.');

if (pages.length !== 70) throw new Error(`Expected 70 policy pages, found ${pages.length}.`);
if (pages.some((page) => /dropship/i.test(`${page.title} ${page.url}`))) throw new Error('Dropshipping policy is outside this policy pack.');

const knownPolicyPages = pages.concat([{ title: 'Intellectual property policy', url: ipUrl }]);
const knownPolicyUrls = new Set(knownPolicyPages.map((page) => page.url));
const canonicalById = new Map();
for (const page of knownPolicyPages) {
  const id = new URL(page.url).searchParams.get('id');
  if (!canonicalById.has(id)) canonicalById.set(id, page);
}
const existing = JSON.parse(fs.readFileSync(extensionRulesPath, 'utf8'));
const research = JSON.parse(fs.readFileSync(researchPath, 'utf8'));

function canonicalEvidenceUrls(urls) {
  return [...new Set((urls || []).map((url) => {
    try {
      if (knownPolicyUrls.has(url)) return url;
      const parsed = new URL(url);
      return canonicalById.get(parsed.searchParams.get('id'))?.url || url;
    } catch {
      return url;
    }
  }))];
}

function inferTopic(rule) {
  for (const url of canonicalEvidenceUrls(rule.evidenceUrls)) {
    try {
      const page = canonicalById.get(new URL(url).searchParams.get('id'));
      if (page) return page.title;
    } catch {
      // Keep looking for another exact evidence URL.
    }
  }
  if (rule.sourceType === 'official-ebay') return 'Official eBay listing policy';
  if (rule.sourceType === 'gldn-operator') return 'GLDN no-list rule';
  return 'Community restriction report';
}

function normalizeRule(rule) {
  const type = String(rule.type || '').trim().toLowerCase();
  const value = String(rule.value || '').trim();
  const sourceType = String(rule.sourceType || 'official-ebay').trim().toLowerCase();
  const allOf = Array.isArray(rule.allOf) ? rule.allOf.map(String).map((item) => item.trim()).filter(Boolean) : [];
  const anyOf = Array.isArray(rule.anyOf) ? rule.anyOf.map(String).map((item) => item.trim()).filter(Boolean) : [];
  const noneOf = Array.isArray(rule.noneOf) ? rule.noneOf.map(String).map((item) => item.trim()).filter(Boolean) : [];
  const key = [type, value.toLowerCase(), allOf.map((item) => item.toLowerCase()).join(','), anyOf.map((item) => item.toLowerCase()).join(','), noneOf.map((item) => item.toLowerCase()).join(','), sourceType].join(':');
  return {
    id: crypto.createHash('sha256').update(key).digest('hex').slice(0, 20),
    type,
    value,
    ...(allOf.length ? { allOf } : {}),
    ...(anyOf.length ? { anyOf } : {}),
    ...(noneOf.length ? { noneOf } : {}),
    action: String(rule.action || rule.decision || '').trim().toLowerCase(),
    reason: String(rule.reason || '').trim(),
    policyTopic: String(rule.policyTopic || inferTopic(rule)).trim(),
    evidenceKind: String(rule.evidenceKind || (rule.action === 'block' || rule.decision === 'block' ? 'explicit-prohibition' : 'conditional-review')).trim(),
    reviewedBy: String(rule.reviewedBy || 'GLDN official eBay policy review').trim(),
    reviewedAt: String(rule.reviewedAt || reviewedAt).trim(),
    source: String(rule.source || (sourceType === 'official-ebay' ? 'official-ebay-policy-reviewed' : sourceType === 'gldn-operator' ? 'gldn-operator-reviewed' : sourceType === 'profile2-discord' ? 'profile2-discord-reviewed' : 'profile2-telegram-reviewed')).trim(),
    sourceType,
    authority: String(rule.authority || (sourceType === 'official-ebay' ? 'eBay' : sourceType === 'gldn-operator' ? 'GLDN Ops operator rule' : sourceType === 'profile2-discord' ? 'EcomSniper Discord community report' : 'EcomSniper Telegram community report')).trim(),
    ...(rule.operatorRuleId ? { operatorRuleId: String(rule.operatorRuleId).trim().toUpperCase() } : {}),
    evidenceUrls: canonicalEvidenceUrls(rule.evidenceUrls)
  };
}

function ruleKey(rule) {
  return [rule.type, rule.value.toLowerCase(), (rule.allOf || []).map((item) => item.toLowerCase()).join(','), (rule.anyOf || []).map((item) => item.toLowerCase()).join(','), (rule.noneOf || []).map((item) => item.toLowerCase()).join(','), rule.sourceType].join(':');
}

const merged = new Map();
for (const rule of existing.rules || []) {
  const normalized = normalizeRule(rule);
  merged.set(ruleKey(normalized), normalized);
}
for (const decision of decisions) {
  const normalized = normalizeRule(decision);
  merged.set(ruleKey(normalized), normalized);
}

const rules = [...merged.values()].sort((left, right) => left.type.localeCompare(right.type) || left.value.localeCompare(right.value));
const coverageHits = new Map(knownPolicyPages.map((page) => [page.url, 0]));
for (const rule of rules) {
  for (const url of rule.evidenceUrls || []) {
    if (coverageHits.has(url)) coverageHits.set(url, coverageHits.get(url) + 1);
  }
}
const uncoveredPages = [...coverageHits.entries()].filter(([, count]) => count === 0).map(([url]) => url);
if (uncoveredPages.length) throw new Error(`Every reviewed policy page must have at least one direct decision: ${uncoveredPages.join(', ')}`);
const generatedAt = new Date().toISOString();
const clearancePolicy = {
  id: 'gldn-keyword-policy-check',
  version: '2026-08-31.1',
  mode: 'keyword-blocklist',
  reviewedAt,
  maxAgeDays: 45,
  reason: 'Classify supplied product text by reviewed prohibited-item and restricted-item keywords. A brand name alone does not stop an item, and a no-match result is not eBay approval.',
  evidenceUrls: [hubUrl, counterfeitUrl, ipUrl, urlFor('Product safety policy')]
};
const pack = {
  schemaVersion: 2,
  version: '2026-08-31.1',
  generatedAt,
  sourceGeneratedAt: reviewedAt,
  ruleCount: rules.length,
  policyCoverage: {
    hubUrl,
    reviewedAt,
    hubPolicyCount: pages.length,
    pages,
    supplementalPages: [{ title: 'Intellectual property policy', url: ipUrl, handling: 'reviewed-for-authenticity-and-infringement-signals' }],
    excludedTopics: ['Dropshipping policy']
  },
  clearancePolicy,
  rules
};

const evidence = {
  schemaVersion: 2,
  sourceGeneratedAt: reviewedAt,
  source: hubUrl,
  hubPolicyCount: pages.length,
  supplementalPolicyCount: 1,
  decisions
};

fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
for (const target of [extensionRulesPath, hunterRulesPath]) {
  fs.writeFileSync(target, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
}
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

for (const source of research.sourceCoverage || []) {
  if (source.sourceType === 'official-ebay') source.publishedRules = rules.filter((rule) => rule.sourceType === 'official-ebay').length;
  if (source.sourceType === 'profile2-discord') source.publishedRules = rules.filter((rule) => rule.sourceType === 'profile2-discord').length;
  if (source.sourceType === 'profile2-telegram') source.publishedRules = rules.filter((rule) => rule.sourceType === 'profile2-telegram').length;
}
research.generatedAt = generatedAt;
fs.writeFileSync(researchPath, `${JSON.stringify(research, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  schemaVersion: pack.schemaVersion,
  hubPolicies: pages.length,
  supplementalPolicies: 1,
  newDecisions: decisions.length,
  rules: rules.length,
  block: rules.filter((rule) => rule.action === 'block').length,
  review: rules.filter((rule) => rule.action === 'review').length
}, null, 2));
