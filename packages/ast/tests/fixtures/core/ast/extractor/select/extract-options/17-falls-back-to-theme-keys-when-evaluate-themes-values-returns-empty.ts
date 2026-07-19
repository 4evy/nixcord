const themes = {
  DarkPlus: 'https://dark',
  LightPlus: 'https://light',
};
const themeNames = Object.keys(themes) as (keyof typeof themes)[];
const obj = {
  options: themeNames.map((name) => ({
    value: name,
  })),
};
