const themes = {
  DarkPlus: 'https://example.com/dark-plus.json',
  LightPlus: 'https://example.com/light-plus.json',
};
const themeNames = Object.keys(themes) as (keyof typeof themes)[];
const obj = { options: themeNames.map((name) => ({ value: themes[name] })) };
