(() => {
  function parseHex(color) {
    const value = String(color || '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
    return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
  }

  function getRelativeLuminance(color) {
    const rgb = parseHex(color) || [87, 83, 217];
    const linear = rgb.map(value => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  }

  function getContrastRatio(colorA, colorB) {
    const a = getRelativeLuminance(colorA);
    const b = getRelativeLuminance(colorB);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  }

  function getAccessibleTextColor(backgroundColor, darkText = '#18181b') {
    return getContrastRatio(backgroundColor, '#ffffff') >= getContrastRatio(backgroundColor, darkText)
      ? '#ffffff' : darkText;
  }

  function getAccessibleInteractiveColor(color, backgroundColor) {
    const rgb = parseHex(color) || [87, 83, 217];
    const background = parseHex(backgroundColor) || [255, 255, 255];
    if (getContrastRatio(color, backgroundColor) >= 3) return color.toLowerCase();
    const target = getRelativeLuminance(backgroundColor) > .5 ? 0 : 255;
    for (let amount = .08; amount <= 1; amount += .08) {
      const adjusted = rgb.map(channel => Math.round(channel * (1 - amount) + target * amount));
      const candidate = `#${adjusted.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
      if (getContrastRatio(candidate, backgroundColor) >= 3) return candidate;
    }
    return target ? '#ffffff' : '#000000';
  }

  globalThis.PLTheme = { parseHex, getRelativeLuminance, getContrastRatio, getAccessibleTextColor, getAccessibleInteractiveColor };
})();
