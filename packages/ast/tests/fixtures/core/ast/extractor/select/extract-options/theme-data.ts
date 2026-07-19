export const SHIKI_REPO = 'Vendicated/Vencord';
export const SHIKI_REPO_COMMIT = 'abcdef1234';
export const shikiRepoTheme = (name: string) => name;
export const themes = {
  DarkPlus: shikiRepoTheme('DarkPlus'),
  MaterialCandy: 'https://themes.example/material.json',
} as const;
