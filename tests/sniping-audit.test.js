const assert = require('node:assert/strict');
const test = require('node:test');

const audit = require('../extension/sniping-audit.js');

const anchor = {
  title: '6Pcs Reusable Microfiber Mop Pads Compatible with Sweeper Mop',
  asin: 'B0DS5X5WQ2',
  url: 'https://www.amazon.com/dp/B0DS5X5WQ2',
  image: 'https://m.media-amazon.com/images/I/example.jpg',
  price: 9.99
};

const ebayListing = {
  seller: 'emhos_84',
  title: 'Microfiber Reusable Mop Cover Set of 6 Washable Mop Cover resuable swiffer cover',
  itemNumber: '406935436196',
  itemUrl: 'https://www.ebay.com/itm/406935436196',
  imageUrl: 'https://i.ebayimg.com/images/g/example/s-l500.webp',
  price: 19.99
};

const exactChecks = {
  confirmed: true,
  titleChecked: true,
  imageChecked: true,
  variantChecked: true
};

test('seller economics enforce 70% markup and an exact five-cent undercut', () => {
  const candidate = audit.buildSellerCandidate(anchor, ebayListing, { minMarkupPercent: 70 });
  assert.equal(candidate.exactAnchorMatch, false);
  assert.equal(candidate.requiresExactReview, true);
  assert.equal(candidate.economics.markupPercent, 100.1);
  assert.equal(candidate.economics.qualifiesMarkup, true);
  assert.equal(candidate.economics.proposedListingPrice, 19.94);
  assert.equal(candidate.economics.grossSpread, 9.95);
  assert.equal(candidate.economics.estimatedNetProfit, 6.56);
  assert.equal(candidate.economics.profitableEstimate, true);
});

test('markup filtering alone never confirms an Amazon match', () => {
  const candidate = audit.buildSellerCandidate(anchor, ebayListing, { minMarkupPercent: 70 });
  const missingReview = audit.confirmSellerCandidate(candidate, {
    confirmed: true,
    titleChecked: true,
    imageChecked: false,
    variantChecked: true
  });
  assert.equal(missingReview.ok, false);
  assert.match(missingReview.error, /Title, image, and pack\/size\/variant/);
  assert.equal(candidate.exactAnchorMatch, false);
});

test('seller qualification requires exact Amazon and eBay identity evidence', () => {
  const candidate = audit.buildSellerCandidate(anchor, ebayListing, { minMarkupPercent: 70 });
  const result = audit.confirmSellerCandidate(candidate, exactChecks, '2026-07-18T22:30:00.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.candidate.phase, 'seller-qualified');
  assert.equal(result.candidate.exactAnchorMatch, true);
  assert.equal(result.candidate.verification.verifiedAt, '2026-07-18T22:30:00.000Z');

  const wrongAsin = audit.buildSellerCandidate({ ...anchor, url: 'https://www.amazon.com/dp/B09NVFT7HP' }, ebayListing);
  assert.equal(audit.confirmSellerCandidate(wrongAsin, exactChecks).ok, false);
});

test('winner review remains read-only until exact match and profit gates pass', () => {
  const review = audit.buildWinnerReview({
    title: ebayListing.title,
    itemNumber: ebayListing.itemNumber,
    url: ebayListing.itemUrl,
    image: ebayListing.imageUrl,
    seller: ebayListing.seller,
    price: ebayListing.price,
    sold30: 3,
    sold90: 9
  }, anchor, { minMarkupPercent: 70 });

  assert.equal(review.exactMatch, false);
  assert.equal(review.preListReady, false);
  const confirmed = audit.confirmWinnerReview(review, exactChecks, '2026-07-18T22:35:00.000Z');
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.review.phase, 'pre-list-review');
  assert.equal(confirmed.review.preListReady, true);
  assert.equal(confirmed.review.listingSubmitted, false);
  assert.equal(confirmed.review.economics.proposedListingPrice, 19.94);
});

test('unprofitable or below-markup winners cannot reach pre-list review', () => {
  const belowMarkup = audit.buildWinnerReview({
    ...ebayListing,
    url: ebayListing.itemUrl,
    price: 12.99
  }, anchor, { minMarkupPercent: 70 });
  const result = audit.confirmWinnerReview(belowMarkup, exactChecks);
  assert.equal(result.ok, false);
  assert.match(result.error, /markup rule/);
});
