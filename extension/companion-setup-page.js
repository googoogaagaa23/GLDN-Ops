// Injected only into the setup-owned provider tab after an explicit user action.
(function () {
  'use strict';
  globalThis.gldnCompanionPage = async function (service, action, credentials, expectedVersion) {
    const origin = service === 'ecomsniper' ? 'https://ecomsniper.io' : 'https://app.trackerbot.me';
    if (location.origin !== origin) throw new Error('The setup tab is no longer on the approved provider.');
    const visible = el => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const buttons = [...document.querySelectorAll('button,input[type="submit"]')].filter(visible);
    const text = String(document.body?.innerText || '');
    const password = [...document.querySelectorAll('input[type="password"]')].find(visible);
    const email = [...document.querySelectorAll('input[type="email"],input[name="email"]')].find(visible);
    const challenge = [...document.querySelectorAll('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare.com"]')].some(visible)
      || /verify you are human|complete the captcha|enter (?:the )?(?:verification|security) code|two.factor authentication/i.test(text);
    if (challenge) return { status: 'verification-required' };
    if (action === 'login') {
      if (!password || !email) return { status: 'check-page' };
      if (!credentials?.email || !credentials?.password) throw new Error('Enter your provider email and password.');
      const submit = buttons.filter(el => /^(?:login|log in)(?:\s*\u2192)?$/i.test((el.innerText || el.value || '').trim()))
        .filter(el => !el.disabled && (el.id === 'loginBtn' || !el.id));
      if (submit.length !== 1) throw new Error('The sign-in button is ambiguous. Sign in on the provider page.');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const [el, value] of [[email, credentials.email], [password, credentials.password]]) {
        set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      submit[0].click();
      return { status: 'login-submitted' };
    }
    if (password) return { status: 'login-required' };
    if (service === 'trackerbot') return { status: 'website-open' };
    if (location.pathname.replace(/\/$/, '') !== '/dashboard/software_downloads') return { status: 'check-page' };
    const versions = [...text.matchAll(/Current Version\s*:\s*v?(\d+(?:\.\d+){1,3})(?![\d.])/gi)].map(m => m[1]);
    const downloads = buttons.filter(el => /^Download Ebay Lister$/i.test((el.innerText || el.value || '').trim()) && !el.disabled);
    if (new Set(versions).size !== 1 || downloads.length !== 1) return { status: 'check-page' };
    if (action === 'download') {
      if (versions[0] !== expectedVersion) throw new Error('The provider version changed. Check again before downloading.');
      downloads[0].click();
      return { status: 'download-clicked', version: versions[0] };
    }
    return { status: 'ready', version: versions[0] };
  };
})();
