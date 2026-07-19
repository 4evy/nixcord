const themes = {
  DarkPlus: 'dark',
  LightPlus: 'light',
} as const;

function makeThemeNames() {
  return Object.keys(themes) as string[];
}

const obj = {
  options: makeThemeNames().map((name) => ({
    value: themes[name as keyof typeof themes],
  })),
};
