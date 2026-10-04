# Optional Companion Setup

Fresh GLDN installations open two independent setup choices. Neither starts
automatically, and skipping does not block GLDN. Existing profiles can open
**Optional Extension Setup** in the popup. Normal updates do not open the page.

## eComSniper

- Download latest eComSniper asks for Chrome's optional downloads permission.
- GLDN opens the official software downloads page in a new tab, reusing that
  Chrome profile's existing sign-in where available.
- If sign-in is needed, use the provider page or the one-use sign-in form in
  setup. GLDN never packages, logs, or persists a provider password.
- The helper reads the current version displayed by the provider and clicks
  its native Download Ebay Lister button. It does not construct signed URLs.
- A matching native download is directed to
  `GLDN-Companions/eComSniper-<version>/Ebay-Lister-<version>.zip`, relative to
  Chrome's configured Downloads directory. Chrome creates the subdirectories.
  Browser download-location prompts or another extension may override the path.
- GLDN reports completion only when Chrome confirms that exact download.
  Blocked or interrupted downloads remain unconfirmed. Browser protections are
  not bypassed. ZIP extraction and loading the unpacked extension remain manual.

The download matcher is deliberately limited to the observed eComSniper ZIP
host/path and a two-minute, user-started window. If the provider changes its
download flow or host, setup must be updated; unrelated downloads are untouched.

## Trackerbot

- Open Trackerbot Chrome Web Store opens the official listing. The user must
  choose Add to Chrome and approve Chrome's installation prompt.
- Open Trackerbot sign-in opens the official website and offers the same
  one-use sign-in flow. CAPTCHA or other verification remains on the provider.
- Website sign-in does not establish that Trackerbot's extension is signed in.
  GLDN cannot read or automate another extension's private pages or silently
  install it. Finish any separate login in Trackerbot itself.

## Validation Boundary

On October 3, 2026, the live eComSniper page displayed version 45.7 and its
download button led to the expected ZIP host. Chrome blocked that navigation
with ERR_BLOCKED_BY_CLIENT in the inspected profile; an actual completed
download has not been demonstrated. Trackerbot's official website login form
was inspected, but extension installation and extension authentication were not
performed. Fixture tests are not a substitute for these live checks.

Starting with v3.12.47, the setup is included in the GitHub extension package
and the full local-install bundle. Open Chrome's GLDN Ops icon, then choose
Optional Extension Setup. Updates do not open the page automatically.

The owner also explicitly approved public publication of the shared dashboard
read/write key on October 4, 2026. New profiles configure the bundled default
without a code prompt. Existing saved connections and private local overrides
are retained. Provider passwords are not published. Bundling the key does not
prove server access: the existing dashboard endpoint returned Google HTTP 403
during the release test.

Validation: `node --test tests/companion-setup.test.js tests/ui-onboarding-universal.test.js`
passes 19 tests. The UI-only preview was checked in Chrome at desktop and
390-pixel widths, including password clearing, separate Trackerbot actions, and
denied download permission. These checks use simulated provider responses.

References: [Chrome downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads),
[Chrome extension installation](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions).
