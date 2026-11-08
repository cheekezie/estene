/**
 * Builds every logo file the apps need from one vector drawing of the Estene
 * mark (traced from estene-logo-original.jpg). Edit the shapes or colours
 * here, then run:  pnpm --filter @estene/theme brand
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');

export const BRAND = { blue: '#3230aa', yellow: '#fbd23a', white: '#ffffff' };

/** The speed lines and italic "EL", on a 600×600 grid. */
const ARTWORK = `
  <g fill="${BRAND.yellow}">
    <polygon points="176,184 284,184 276,216 152,216"/>
    <polygon points="112,276 264,276 256,306 88,306"/>
    <polygon points="48,360 346,360 342,392 24,392"/>
  </g>
  <g fill="${BRAND.white}">
    <polygon points="328,108 462,108 450,138 326,138"/>
    <polygon points="332,138 376,138 336,318 292,318"/>
    <polygon points="326,186 440,186 430,214 318,214"/>
    <polygon points="426,230 478,230 462,290 410,290"/>
    <polygon points="292,288 462,288 456,318 292,318"/>
    <polygon points="414,318 458,318 434,412 390,412"/>
    <polygon points="392,412 510,412 514,398 526,398 514,442 388,442"/>
  </g>`;

const svg = (body, w = 600, h = 600) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>\n`;

/** Round badge, transparent corners — the everyday logo and favicon. */
const MARK = svg(`<circle cx="300" cy="300" r="300" fill="${BRAND.blue}"/>${ARTWORK}`);

/**
 * Full-bleed square with the artwork inside the 80% safe zone — for app icons
 * the OS crops to its own shape (iOS home screen, Android maskable).
 */
const TILE = svg(
  `<rect width="600" height="600" fill="${BRAND.blue}"/>` +
    `<g transform="translate(85.5 85.5) scale(0.78)">${ARTWORK}</g>`,
);

/** 1200×630 link preview for the website. */
const OG = svg(
  `<rect width="1200" height="630" fill="${BRAND.blue}"/>
   <g transform="translate(90 135) scale(0.6)">
     <circle cx="300" cy="300" r="300" fill="#2a2894"/>${ARTWORK}
   </g>
   <text x="520" y="290" font-family="Manrope, Inter, Helvetica, Arial, sans-serif" font-size="92" font-weight="800" fill="${BRAND.white}" letter-spacing="-2">Estene</text>
   <text x="524" y="360" font-family="Manrope, Inter, Helvetica, Arial, sans-serif" font-size="40" font-weight="600" fill="${BRAND.yellow}">Logistics</text>
   <text x="524" y="440" font-family="Inter, Helvetica, Arial, sans-serif" font-size="34" fill="#dfe3ff">Parcel delivery across Abuja</text>`,
  1200,
  630,
);

const png = (source, size) =>
  sharp(Buffer.from(source), { density: 72 * (size / 600) * 2 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

/** A .ico holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const manifest = (name, shortName, description) =>
  JSON.stringify(
    {
      name,
      short_name: shortName,
      description,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: BRAND.blue,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  ) + '\n';

async function put(path, data) {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
  console.log('  ' + path);
}

const favicon = ico([
  { size: 16, data: await png(MARK, 16) },
  { size: 32, data: await png(MARK, 32) },
  { size: 48, data: await png(MARK, 48) },
]);
const icons = {
  'icon-192.png': await png(MARK, 192),
  'icon-512.png': await png(MARK, 512),
  'icon-maskable-512.png': await png(TILE, 512),
};
const appleIcon = await png(TILE, 180);

console.log('Brand sources');
await put('packages/theme/brand/estene-mark.svg', MARK);
await put('packages/theme/brand/estene-tile.svg', TILE);
await put('packages/theme/brand/estene-mark-1024.png', await png(MARK, 1024));

// Vite apps: everything in public/, linked from index.html.
const viteApps = {
  admin: ['Estene Ops', 'Estene Ops', 'Operations console for Estene Logistics'],
  portal: ['Estene Business', 'Estene', 'Stock, orders and deliveries for Estene business clients'],
};
for (const [app, [name, short, description]] of Object.entries(viteApps)) {
  console.log(`apps/${app}`);
  const pub = `apps/${app}/public`;
  await put(`${pub}/favicon.svg`, MARK);
  await put(`${pub}/favicon.ico`, favicon);
  await put(`${pub}/apple-touch-icon.png`, appleIcon);
  for (const [file, data] of Object.entries(icons)) await put(`${pub}/${file}`, data);
  await put(`${pub}/site.webmanifest`, manifest(name, short, description));
}

// Next.js website: app/ file conventions (icon, apple-icon, favicon, OG image);
// the manifest (app/manifest.ts) points at the PNGs in public/.
console.log('apps/web');
await put('apps/web/src/app/favicon.ico', favicon);
await put('apps/web/src/app/icon.svg', MARK);
await put('apps/web/src/app/apple-icon.png', appleIcon);
await put(
  'apps/web/src/app/opengraph-image.png',
  await sharp(Buffer.from(OG)).png({ compressionLevel: 9 }).toBuffer(),
);
for (const [file, data] of Object.entries(icons)) await put(`apps/web/public/${file}`, data);
