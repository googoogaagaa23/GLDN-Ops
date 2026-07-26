(function attachSnipingAudit(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GLDN_SNIPING_AUDIT = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_FEE_RATE_PERCENT = 15;
  const DEFAULT_FIXED_FEE = 0.40;
  const DEFAULT_UNDERCUT = 0.05;

  function roundMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : null;
  }

  function positiveMoney(value) {
    const number = roundMoney(value);
    return number !== null && number > 0 ? number : null;
  }

  function normalizeAsin(value) {
    const asin = String(value || "").trim().toUpperCase();
    return /^[A-Z0-9]{10}$/.test(asin) ? asin : "";
  }

  function normalizeItemNumber(value) {
    const itemNumber = String(value || "").replace(/\D/g, "");
    return /^\d{9,15}$/.test(itemNumber) ? itemNumber : "";
  }

  function normalizeWords(value) {
    const stop = new Set(["a", "an", "and", "for", "from", "in", "of", "on", "the", "to", "with"]);
    return [...new Set(String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stop.has(word)))];
  }

  function titleSimilarity(left, right) {
    const a = normalizeWords(left);
    const b = normalizeWords(right);
    if (!a.length || !b.length) return 0;
    const bSet = new Set(b);
    const overlap = a.filter((word) => bSet.has(word)).length;
    return Math.round((overlap / Math.max(a.length, b.length)) * 1000) / 1000;
  }

  function amazonUrlMatchesAsin(url, asin) {
    const normalizedAsin = normalizeAsin(asin);
    if (!normalizedAsin) return false;
    const match = String(url || "").match(/amazon\.com\/(?:[^?#]*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
    return normalizeAsin(match?.[1]) === normalizedAsin;
  }

  function ebayUrlMatchesItem(url, itemNumber) {
    const normalizedItem = normalizeItemNumber(itemNumber);
    if (!normalizedItem) return false;
    const match = String(url || "").match(/ebay\.com\/itm\/(?:[^/?#]+\/)?(\d{9,15})(?:[/?#]|$)/i);
    return normalizeItemNumber(match?.[1]) === normalizedItem;
  }

  function calculateEconomics(input = {}) {
    const amazonPrice = positiveMoney(input.amazonPrice);
    const ebayPrice = positiveMoney(input.ebayPrice);
    const minMarkupPercent = Math.max(0, Number(input.minMarkupPercent ?? 70));
    const undercutAmount = positiveMoney(input.undercutAmount ?? DEFAULT_UNDERCUT) || DEFAULT_UNDERCUT;
    const feeRatePercent = Math.max(0, Number(input.feeRatePercent ?? DEFAULT_FEE_RATE_PERCENT));
    const fixedFee = Math.max(0, Number(input.fixedFee ?? DEFAULT_FIXED_FEE));
    if (amazonPrice === null || ebayPrice === null) {
      return {
        ok: false,
        error: "Amazon and eBay prices must both be positive numbers.",
        amazonPrice,
        ebayPrice
      };
    }

    const markupPercent = Math.round((((ebayPrice - amazonPrice) / amazonPrice) * 100) * 10) / 10;
    const minimumEbayPrice = roundMoney(amazonPrice * (1 + minMarkupPercent / 100));
    const proposedListingPrice = roundMoney(ebayPrice - undercutAmount);
    const grossSpread = roundMoney(proposedListingPrice - amazonPrice);
    const estimatedMarketplaceFee = roundMoney((proposedListingPrice * feeRatePercent / 100) + fixedFee);
    const estimatedNetProfit = roundMoney(proposedListingPrice - amazonPrice - estimatedMarketplaceFee);
    return {
      ok: proposedListingPrice > 0,
      amazonPrice,
      ebayPrice,
      minMarkupPercent,
      markupPercent,
      qualifiesMarkup: markupPercent >= minMarkupPercent,
      minimumEbayPrice,
      undercutAmount,
      proposedListingPrice,
      grossSpread,
      feeRatePercent,
      fixedFee: roundMoney(fixedFee),
      estimatedMarketplaceFee,
      estimatedNetProfit,
      profitableEstimate: estimatedNetProfit > 0,
      estimateLabel: `Estimated with ${feeRatePercent}% marketplace fee + $${roundMoney(fixedFee).toFixed(2)} fixed fee; supplier tax and other costs are not included.`
    };
  }

  function buildSellerCandidate(anchorProduct = {}, ebayListing = {}, options = {}) {
    const economics = calculateEconomics({
      amazonPrice: anchorProduct.price,
      ebayPrice: ebayListing.price,
      minMarkupPercent: options.minMarkupPercent,
      feeRatePercent: options.feeRatePercent,
      fixedFee: options.fixedFee,
      undercutAmount: options.undercutAmount
    });
    return {
      phase: "seller-candidate",
      seller: String(ebayListing.seller || "").trim(),
      ebayTitle: String(ebayListing.title || "").trim(),
      ebayItemNumber: normalizeItemNumber(ebayListing.itemNumber),
      ebayUrl: String(ebayListing.itemUrl || ebayListing.url || "").trim(),
      ebayImage: String(ebayListing.imageUrl || ebayListing.image || "").trim(),
      amazonTitle: String(anchorProduct.title || "").trim(),
      amazonAsin: normalizeAsin(anchorProduct.asin),
      amazonUrl: String(anchorProduct.url || "").trim(),
      amazonImage: String(anchorProduct.imageUrl || anchorProduct.image || "").trim(),
      titleSimilarity: titleSimilarity(anchorProduct.title, ebayListing.title),
      economics,
      exactAnchorMatch: false,
      requiresExactReview: true
    };
  }

  function exactReviewChecks(evidence = {}) {
    return Boolean(evidence.titleChecked && evidence.imageChecked && evidence.variantChecked && evidence.confirmed === true);
  }

  function confirmSellerCandidate(candidate = {}, evidence = {}, now = new Date().toISOString()) {
    if (!candidate.economics?.ok || !candidate.economics.qualifiesMarkup) {
      return { ok: false, error: "The seller candidate does not meet the configured markup rule." };
    }
    if (!candidate.seller || !ebayUrlMatchesItem(candidate.ebayUrl, candidate.ebayItemNumber)) {
      return { ok: false, error: "The eBay seller or exact item URL is missing." };
    }
    if (!amazonUrlMatchesAsin(candidate.amazonUrl, candidate.amazonAsin)) {
      return { ok: false, error: "The exact Amazon ASIN URL is missing." };
    }
    if (!exactReviewChecks(evidence)) {
      return { ok: false, error: "Title, image, and pack/size/variant must all be checked before confirming an exact match." };
    }
    return {
      ok: true,
      candidate: {
        ...candidate,
        phase: "seller-qualified",
        exactAnchorMatch: true,
        requiresExactReview: false,
        verification: {
          titleChecked: true,
          imageChecked: true,
          variantChecked: true,
          verifiedAt: String(now || new Date().toISOString())
        }
      }
    };
  }

  function buildWinnerReview(ebayWinner = {}, amazonMatch = {}, options = {}) {
    const economics = calculateEconomics({
      amazonPrice: amazonMatch.price,
      ebayPrice: ebayWinner.price,
      minMarkupPercent: options.minMarkupPercent,
      feeRatePercent: options.feeRatePercent,
      fixedFee: options.fixedFee,
      undercutAmount: options.undercutAmount
    });
    return {
      phase: "winner-review",
      ebayTitle: String(ebayWinner.title || "").trim(),
      ebayItemNumber: normalizeItemNumber(ebayWinner.itemNumber),
      ebayUrl: String(ebayWinner.url || ebayWinner.itemUrl || "").trim(),
      ebayImage: String(ebayWinner.image || ebayWinner.imageUrl || "").trim(),
      seller: String(ebayWinner.seller || "").trim(),
      recentSold30: Number(ebayWinner.recentSold30 ?? ebayWinner.sold30 ?? 0),
      recentSold90: Number(ebayWinner.recentSold90 ?? ebayWinner.sold90 ?? 0),
      amazonTitle: String(amazonMatch.title || "").trim(),
      amazonAsin: normalizeAsin(amazonMatch.asin),
      amazonUrl: String(amazonMatch.url || "").trim(),
      amazonImage: String(amazonMatch.image || amazonMatch.imageUrl || "").trim(),
      titleSimilarity: titleSimilarity(ebayWinner.title, amazonMatch.title),
      economics,
      exactMatch: false,
      preListReady: false
    };
  }

  function confirmWinnerReview(review = {}, evidence = {}, now = new Date().toISOString()) {
    if (!ebayUrlMatchesItem(review.ebayUrl, review.ebayItemNumber)) {
      return { ok: false, error: "The exact eBay winner URL is missing." };
    }
    if (!amazonUrlMatchesAsin(review.amazonUrl, review.amazonAsin)) {
      return { ok: false, error: "The exact Amazon ASIN URL is missing." };
    }
    if (!exactReviewChecks(evidence)) {
      return { ok: false, error: "Title, image, and pack/size/variant must all be checked before confirming an exact match." };
    }
    if (!review.economics?.ok || !review.economics.qualifiesMarkup) {
      return { ok: false, error: "The winner does not meet the configured markup rule." };
    }
    if (!review.economics.profitableEstimate) {
      return { ok: false, error: "The conservative profit estimate is not positive." };
    }
    if (roundMoney(review.economics.ebayPrice - review.economics.proposedListingPrice) !== DEFAULT_UNDERCUT) {
      return { ok: false, error: "The proposed listing price is not exactly $0.05 below the competitor." };
    }
    return {
      ok: true,
      review: {
        ...review,
        phase: "pre-list-review",
        exactMatch: true,
        preListReady: true,
        listingSubmitted: false,
        verification: {
          titleChecked: true,
          imageChecked: true,
          variantChecked: true,
          verifiedAt: String(now || new Date().toISOString())
        }
      }
    };
  }

  return {
    DEFAULT_FEE_RATE_PERCENT,
    DEFAULT_FIXED_FEE,
    DEFAULT_UNDERCUT,
    roundMoney,
    normalizeAsin,
    normalizeItemNumber,
    titleSimilarity,
    amazonUrlMatchesAsin,
    ebayUrlMatchesItem,
    calculateEconomics,
    buildSellerCandidate,
    confirmSellerCandidate,
    buildWinnerReview,
    confirmWinnerReview
  };
});
