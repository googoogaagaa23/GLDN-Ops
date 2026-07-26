(() => {
  const root = globalThis;

  const PATTERNS = Object.freeze({
    none: 'none',
    grain: 'repeating-linear-gradient(135deg, rgba(255,255,255,.025) 0 1px, transparent 1px 5px)',
    grid: 'linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)',
    scan: 'repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 5px)',
    stripes: 'repeating-linear-gradient(135deg, rgba(255,255,255,.055) 0 7px, transparent 7px 15px)',
    contour: 'repeating-radial-gradient(ellipse at 20% 10%, transparent 0 12px, rgba(255,255,255,.045) 13px 14px, transparent 15px 27px)',
    circuit: 'linear-gradient(90deg, transparent 48%, rgba(255,255,255,.055) 49% 51%, transparent 52%), linear-gradient(0deg, transparent 48%, rgba(255,255,255,.055) 49% 51%, transparent 52%)',
    waves: 'repeating-radial-gradient(ellipse at 0 50%, transparent 0 11px, rgba(255,255,255,.05) 12px 14px, transparent 15px 27px)',
    dots: 'radial-gradient(circle, rgba(255,255,255,.075) 1px, transparent 1.5px)',
    checker: 'linear-gradient(45deg, rgba(255,255,255,.045) 25%, transparent 25% 75%, rgba(255,255,255,.045) 75%), linear-gradient(45deg, rgba(255,255,255,.045) 25%, transparent 25% 75%, rgba(255,255,255,.045) 75%)',
    bars: 'repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 3px, transparent 3px 13px)',
    shards: 'linear-gradient(125deg, transparent 0 35%, rgba(255,255,255,.06) 36% 42%, transparent 43% 100%), linear-gradient(55deg, transparent 0 58%, rgba(255,255,255,.035) 59% 65%, transparent 66% 100%)',
    paper: 'repeating-linear-gradient(0deg, transparent 0 22px, rgba(15,23,42,.06) 23px 24px)',
    grass: 'repeating-linear-gradient(82deg, rgba(132,204,22,.07) 0 2px, transparent 2px 9px), linear-gradient(180deg, rgba(125,211,252,.08), transparent 45%)',
    portal: 'radial-gradient(ellipse at 20% 50%, rgba(59,130,246,.12), transparent 28%), radial-gradient(ellipse at 80% 50%, rgba(249,115,22,.12), transparent 28%)',
    prism: 'linear-gradient(120deg, rgba(244,114,182,.08), transparent 25%, rgba(34,211,238,.08) 50%, transparent 72%, rgba(168,85,247,.08))',
    camo: 'linear-gradient(145deg, rgba(255,255,255,.045) 0 18%, transparent 19% 43%, rgba(255,255,255,.03) 44% 62%, transparent 63%)'
  });

  const theme = (id, label, group, colors, pattern = 'grain', mode = 'dark') => Object.freeze({
    id,
    label,
    group,
    mode,
    pattern,
    ...colors
  });

  const dark = (window, surface, raised, border, accent, link = accent, accentText = '#ffffff') => ({
    body: window,
    window,
    surface,
    raised,
    border,
    text: '#f8fafc',
    muted: '#cbd5e1',
    accent,
    accentText,
    link,
    success: '#86efac',
    warning: '#fcd34d',
    danger: '#fca5a5',
    shadow: 'rgba(0,0,0,.68)'
  });

  const light = (body, window, surface, raised, border, accent, link = accent, accentText = '#ffffff') => ({
    body,
    window,
    surface,
    raised,
    border,
    text: '#111827',
    muted: '#334155',
    accent,
    accentText,
    link,
    success: '#166534',
    warning: '#92400e',
    danger: '#b91c1c',
    shadow: 'rgba(15,23,42,.24)'
  });

  const themes = Object.freeze([
    theme('dark', 'Dark', 'Core', dark('#0f172a', '#1e293b', '#27364b', '#64748b', '#2563eb', '#93c5fd'), 'grain'),
    theme('light', 'Light', 'Core', light('#f8fafc', '#ffffff', '#f1f5f9', '#e2e8f0', '#94a3b8', '#1d4ed8', '#1d4ed8'), 'none', 'light'),
    theme('graphite', 'Graphite', 'Core', dark('#18181b', '#27272a', '#343438', '#71717a', '#a3e635', '#c4b5fd', '#17210a'), 'grain'),
    theme('signal', 'Signal', 'Core', dark('#141416', '#26262a', '#323238', '#71717a', '#dc2626', '#fca5a5'), 'scan'),
    theme('midnight', 'Midnight', 'Core', dark('#07111f', '#0b1c2f', '#102a46', '#2563eb', '#3b82f6', '#93c5fd', '#0b172a'), 'grid'),
    theme('crimson', 'Crimson', 'Core', dark('#17090c', '#260d13', '#3f111c', '#be123c', '#e11d48', '#fda4af'), 'waves'),

    theme('touch-grass-again', 'Touch Grass (Again)', 'Limited Editions', dark('#102117', '#19351f', '#264f2c', '#65a30d', '#84cc16', '#7dd3fc', '#142007'), 'grass'),
    theme('sketch-2d', 'Sketch 2D', 'Limited Editions', light('#f4f1e8', '#fffdf8', '#eeeade', '#e2ddd0', '#525252', '#171717', '#1d4ed8'), 'paper', 'light'),
    theme('killswitch', 'Killswitch', 'Limited Editions', dark('#0d0e12', '#1a1c24', '#292c38', '#6d28d9', '#7c3aed', '#c4b5fd'), 'shards'),
    theme('white-damascus', 'White Damascus', 'Limited Editions', light('#f8fafc', '#ffffff', '#eef2ff', '#e0e7ff', '#94a3b8', '#7c3aed', '#0369a1'), 'prism', 'light'),
    theme('tank-case', 'Tank Case', 'Limited Editions', dark('#151812', '#24291e', '#303827', '#6b7350', '#f59e0b', '#facc15', '#1c1917'), 'camo'),
    theme('circuit-board', 'Circuit Board', 'Limited Editions', dark('#07120d', '#0d2116', '#143421', '#4d7c0f', '#84cc16', '#86efac', '#142007'), 'circuit'),
    theme('damascus', 'Damascus', 'Limited Editions', dark('#100c18', '#211533', '#32204b', '#7e22ce', '#a855f7', '#67e8f9', '#1f0a2b'), 'waves'),
    theme('teardown', 'Teardown', 'Limited Editions', dark('#101214', '#1d2328', '#27323a', '#52606d', '#f97316', '#67e8f9', '#1f1308'), 'circuit'),
    theme('area-51', 'Area 51', 'Limited Editions', dark('#15180f', '#262b19', '#343b20', '#6b7044', '#d4d84a', '#bef264', '#1a1c08'), 'contour'),
    theme('solitaire', 'Solitaire', 'Limited Editions', light('#bfc3c7', '#d9dde1', '#eef0f2', '#ffffff', '#4b5563', '#1e3a8a', '#1e3a8a'), 'dots', 'light'),
    theme('cosmic-orange', 'Cosmic Orange', 'Limited Editions', dark('#120c1b', '#241332', '#351a48', '#7c3aed', '#f97316', '#c4b5fd', '#1f1308'), 'shards'),
    theme('hydrodip', 'Hydrodip', 'Limited Editions', dark('#140b1f', '#2a123c', '#3c1855', '#9333ea', '#22d3ee', '#f9a8d4', '#082f49'), 'prism'),
    theme('darkplates-2', 'Darkplates 2.0', 'Limited Editions', dark('#09090b', '#18181b', '#27272a', '#52525b', '#3b82f6', '#93c5fd', '#0b172a'), 'grain'),
    theme('leather', 'Leather', 'Limited Editions', dark('#1a100b', '#2e1a10', '#452617', '#7c4a2d', '#d4a373', '#f5d0a9', '#26170e'), 'grain'),
    theme('x-ray', 'X-Ray', 'Limited Editions', dark('#050708', '#131719', '#1d252a', '#58666e', '#e2e8f0', '#67e8f9', '#111827'), 'scan'),
    theme('robot-city', 'Robot City', 'Limited Editions', light('#f4f1e8', '#fffef9', '#ece8dc', '#ded8c9', '#404040', '#dc2626', '#1d4ed8'), 'grid', 'light'),
    theme('carnage', 'Carnage', 'Limited Editions', dark('#100506', '#26090b', '#3c0d10', '#991b1b', '#dc2626', '#fca5a5'), 'shards'),
    theme('icons', 'ICONS', 'Limited Editions', dark('#111111', '#1f1f1f', '#2f2f2f', '#666666', '#f59e0b', '#fde68a', '#1c1917'), 'dots'),
    theme('palettes', 'Palettes', 'Limited Editions', light('#e7f7f4', '#fffaf4', '#eef0ff', '#f7e8ef', '#64748b', '#0f766e', '#be123c'), 'prism', 'light'),
    theme('something', 'Something', 'Limited Editions', light('#f7f7f7', '#ffffff', '#ececec', '#dedede', '#404040', '#dc2626', '#1d4ed8'), 'circuit', 'light'),
    theme('manifesto', 'Manifesto', 'Limited Editions', dark('#0c0c0d', '#1a1a1d', '#29292d', '#52525b', '#facc15', '#fde68a', '#1c1917'), 'bars'),
    theme('verified', 'Verified', 'Limited Editions', dark('#08131f', '#102b43', '#173f5f', '#3b82f6', '#38bdf8', '#bae6fd', '#082f49'), 'checker'),
    theme('switchdeck', 'Switchdeck', 'Limited Editions', dark('#0c0d12', '#1b1e28', '#262b38', '#64748b', '#ec4899', '#67e8f9', '#1f1020'), 'bars'),

    theme('touch-grass-2025', 'Touch Grass 2025', 'Retired Editions', dark('#132016', '#203923', '#2c4c30', '#4d7c0f', '#65a30d', '#86efac', '#142007'), 'grass'),
    theme('glowbot', 'Glowbot', 'Retired Editions', dark('#07110f', '#0c2420', '#123a31', '#0f766e', '#2dd4bf', '#a7f3d0', '#062c27'), 'circuit'),
    theme('aperture', 'Aperture', 'Retired Editions', light('#eef2f5', '#ffffff', '#e7ebef', '#d9e0e6', '#64748b', '#ea580c', '#1d4ed8', '#1c1917'), 'portal', 'light'),
    theme('retro-darkplates', 'Retro Darkplates', 'Retired Editions', dark('#171225', '#2b2142', '#3b2f58', '#7c3aed', '#14b8a6', '#c4b5fd', '#062c2a'), 'checker'),
    theme('case-hardened', 'Case Hardened', 'Retired Editions', dark('#11151b', '#202936', '#2d3b4d', '#64748b', '#d4a72c', '#93c5fd', '#231c05'), 'shards'),
    theme('arachnoplates', 'Arachnoplates', 'Retired Editions', dark('#0b090c', '#1d1018', '#321322', '#881337', '#e11d48', '#fda4af'), 'waves'),
    theme('keycaps', 'Keycaps', 'Retired Editions', light('#d8d2c2', '#eee9dc', '#f7f4eb', '#cbc3b1', '#57534e', '#334155', '#1e3a8a'), 'grid', 'light'),
    theme('mkbhd-keycaps', 'MKBHD Keycaps', 'Retired Editions', dark('#0c0c0c', '#1b1b1b', '#2b2b2b', '#737373', '#dc2626', '#fca5a5'), 'grid'),
    theme('the-verge', 'The Verge', 'Retired Editions', dark('#15091f', '#2c1040', '#43175e', '#9333ea', '#d946ef', '#67e8f9', '#2a0b2d'), 'prism'),
    theme('clone-of-the-kingdom', 'Clone of the Kingdom', 'Retired Editions', light('#eee7d2', '#faf6e8', '#e5dcc2', '#d7cba7', '#57534e', '#166534', '#365314'), 'contour', 'light'),
    theme('inferno', 'Inferno', 'Retired Editions', dark('#150704', '#2d0d05', '#471406', '#9a3412', '#f97316', '#fdba74', '#211006'), 'waves'),
    theme('diy-kit', 'DIY Kit', 'Retired Editions', light('#c9aa7c', '#e0c394', '#efd5aa', '#b8915c', '#5b4630', '#1d4ed8', '#7c2d12'), 'paper', 'light'),
    theme('masks', 'Masks', 'Retired Editions', dark('#09171a', '#102b31', '#17414a', '#0e7490', '#22d3ee', '#a5f3fc', '#083344'), 'scan'),
    theme('linus-tech-tips', 'Linus Tech Tips', 'Retired Editions', dark('#111111', '#232323', '#323232', '#737373', '#f97316', '#fdba74', '#1f1308'), 'circuit'),
    theme('pewdiepie', 'PewDiePie', 'Retired Editions', dark('#12080a', '#271014', '#3b171d', '#991b1b', '#dc2626', '#fecaca'), 'waves'),
    theme('not-animal-crossing', '(not) Animal Crossing', 'Retired Editions', light('#d9f2e6', '#f5fff9', '#e8f8ef', '#f7e4df', '#557267', '#0f766e', '#be123c'), 'dots', 'light'),
    theme('doomsday-kit', 'Doomsday Kit', 'Retired Editions', dark('#15130a', '#28230d', '#3b3410', '#a16207', '#facc15', '#fde68a', '#1c1917'), 'stripes'),
    theme('robot-camo', 'Robot Camo', 'Retired Editions', dark('#111315', '#25292c', '#343a3f', '#737b82', '#d1d5db', '#e5e7eb', '#111827'), 'camo'),
    theme('boxing-day-cube', 'Boxing Day Cube', 'Retired Editions', dark('#130b0d', '#2b1519', '#3e2025', '#7f1d1d', '#22c55e', '#fca5a5', '#052e16'), 'checker'),
    theme('robot', 'Robot', 'Retired Editions', light('#eeeae1', '#fffdf7', '#e7e1d5', '#d8d0c2', '#525252', '#2563eb', '#b91c1c'), 'grid', 'light')
  ]);

  const themeMap = new Map(themes.map((entry) => [entry.id, entry]));
  const groupOrder = Object.freeze(['Core', 'Limited Editions', 'Retired Editions']);
  const cssVariables = Object.freeze({
    body: '--gldn-theme-body',
    window: '--gldn-theme-window',
    surface: '--gldn-theme-surface',
    raised: '--gldn-theme-raised',
    border: '--gldn-theme-border',
    text: '--gldn-theme-text',
    muted: '--gldn-theme-muted',
    accent: '--gldn-theme-accent',
    accentText: '--gldn-theme-accent-text',
    link: '--gldn-theme-link',
    success: '--gldn-theme-success',
    warning: '--gldn-theme-warning',
    danger: '--gldn-theme-danger',
    shadow: '--gldn-theme-shadow'
  });

  const normalize = (value) => {
    const id = String(value || '').trim().toLowerCase();
    return themeMap.has(id) ? id : 'dark';
  };

  const get = (value) => themeMap.get(normalize(value));

  const hexToRgb = (hex) => {
    const value = String(hex || '').replace('#', '');
    const expanded = value.length === 3 ? value.split('').map((char) => char + char).join('') : value;
    const number = Number.parseInt(expanded, 16);
    return `${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}`;
  };

  const apply = (element, value) => {
    const selected = get(value);
    if (!element?.style) return selected.id;
    const previousTheme = String(element.dataset.gldnTheme || '');
    const wasAppliedByGldn = element.dataset.gldnThemeReady === 'true' && Boolean(previousTheme);
    const isExtensionPage = root.location?.protocol === 'chrome-extension:';
    const extensionAliases = {
      '--bg': 'body',
      '--panel': 'surface',
      '--panel2': 'raised',
      '--line': 'border',
      '--ink': 'text',
      '--muted': 'muted',
      '--gold': 'accent',
      '--blue': 'accent'
    };

    // Generic root theme attributes can trigger a marketplace's own dark mode.
    // Keep them on GLDN-owned pages and expose only namespaced tokens on websites.
    if (isExtensionPage) {
      element.dataset.theme = selected.id;
      element.style.colorScheme = selected.mode;
      for (const [variable, key] of Object.entries(extensionAliases)) {
        element.style.setProperty(variable, selected[key]);
      }
    } else if (wasAppliedByGldn) {
      if (element.dataset.theme === previousTheme) delete element.dataset.theme;
      if (element.style.colorScheme === get(previousTheme).mode) {
        if (typeof element.style.removeProperty === 'function') element.style.removeProperty('color-scheme');
        else element.style.colorScheme = '';
      }
      if (typeof element.style.getPropertyValue === 'function' && typeof element.style.removeProperty === 'function') {
        const previousSelected = get(previousTheme);
        for (const [variable, key] of Object.entries(extensionAliases)) {
          if (element.style.getPropertyValue(variable).trim() === String(previousSelected[key])) {
            element.style.removeProperty(variable);
          }
        }
      }
    }
    element.dataset.gldnTheme = selected.id;
    element.dataset.gldnThemeReady = 'true';
    element.style.setProperty('--gldn-color-scheme', selected.mode);
    for (const [key, variable] of Object.entries(cssVariables)) {
      element.style.setProperty(variable, selected[key]);
    }
    element.style.setProperty('--gldn-theme-window-rgb', hexToRgb(selected.window));
    element.style.setProperty('--gldn-theme-surface-rgb', hexToRgb(selected.surface));
    element.style.setProperty('--gldn-theme-raised-rgb', hexToRgb(selected.raised));
    element.style.setProperty('--gldn-theme-pattern', PATTERNS[selected.pattern] || PATTERNS.grain);
    return selected.id;
  };

  const populateSelect = (select) => {
    if (!select) return;
    const selected = normalize(select.value);
    const groups = groupOrder.map((groupName) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = groupName;
      for (const entry of themes.filter((item) => item.group === groupName)) {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = entry.label;
        optgroup.appendChild(option);
      }
      return optgroup;
    });
    select.replaceChildren(...groups);
    select.value = selected;
  };

  const renderPreview = (container, value) => {
    if (!container) return;
    const selected = get(value);
    container.replaceChildren();
    const swatches = document.createElement('span');
    swatches.className = 'gldn-theme-swatches';
    for (const color of [selected.window, selected.surface, selected.accent]) {
      const swatch = document.createElement('i');
      swatch.style.background = color;
      swatches.appendChild(swatch);
    }
    const label = document.createElement('span');
    label.textContent = `${selected.label} · ${selected.group}`;
    container.append(swatches, label);
  };

  root.GLDN_THEME_CATALOG = Object.freeze({
    source: 'https://dbrand.com/shop/limited-edition',
    sourceChecked: '2026-07-22',
    themes,
    ids: Object.freeze(themes.map((entry) => entry.id)),
    activeEditionIds: Object.freeze(themes.filter((entry) => entry.group === 'Limited Editions').map((entry) => entry.id)),
    retiredEditionIds: Object.freeze(themes.filter((entry) => entry.group === 'Retired Editions').map((entry) => entry.id)),
    normalize,
    get,
    apply,
    populateSelect,
    renderPreview
  });
})();
