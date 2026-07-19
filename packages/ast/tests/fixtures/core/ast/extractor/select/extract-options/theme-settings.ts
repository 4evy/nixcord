import { themes } from './theme-data';

const themeNames = Object.keys(themes) as (keyof typeof themes)[];
const obj = {
  options: themeNames.map((name) => ({
    value: themes[name],
    label: name,
  })),
};
