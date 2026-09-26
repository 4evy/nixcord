import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Run through npm run generate-social-preview so the logo is generated first.
const publicDirectory = resolve(import.meta.dirname, '../public');
const logo = await readFile(resolve(publicDirectory, 'nixcord-logo.svg'), 'utf8');
const logoPath = logo.match(/<path[^>]+ d="([^"]+)"/)?.[1];
if (!logoPath) throw new Error('The generated Nixcord logo has no path');

const width = 1280;
const height = 640;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Nixcord</title>
  <desc id="description">Discord, configured with Nix.</desc>
  <metadata>Logo adapted from NixOS artwork, CC BY 4.0: https://github.com/NixOS/branding - https://creativecommons.org/licenses/by/4.0/</metadata>
  <defs><path id="logo" fill-rule="evenodd" d="${logoPath}"/></defs>
  <rect width="${width}" height="${height}" fill="#11121b"/>
  <use href="#logo" transform="translate(1320 322) scale(1.85)" fill="none" stroke="#30345d" stroke-width="1.4"/>
  <use href="#logo" transform="translate(269 312) scale(1.065)" fill="#5865f2"/>
  <text transform="translate(496 348) scale(1.065 1)" fill="#fafaff" font-family="Inter Display" font-size="181" font-weight="800" letter-spacing="-5.3" textLength="625" lengthAdjust="spacingAndGlyphs">Nixcord</text>
  <text x="498" y="408" fill="#b8b9d0" font-family="Inter Display" font-size="47" textLength="624" lengthAdjust="spacingAndGlyphs">Discord, configured with Nix.</text>
</svg>
`;

// Vendored Inter 4.1 fonts make the output independent of installed system fonts.
// Source: https://github.com/rsms/inter/releases/tag/v4.1 (SIL Open Font License).
const renderer = new Resvg(svg, {
  font: {
    loadSystemFonts: false,
    fontFiles: ['InterDisplay-ExtraBold.ttf', 'InterDisplay-Regular.ttf'].map((name) =>
      resolve(import.meta.dirname, '../assets/fonts', name)
    ),
  },
});
await writeFile(resolve(publicDirectory, 'nixcord-social-preview.svg'), svg);
await writeFile(resolve(publicDirectory, 'nixcord-social-preview.png'), renderer.render().asPng());
