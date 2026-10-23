// Brollvia JS SDK — minimal example. Run:
//   BROLLVIA_BASE=https://brollvia.com BROLLVIA_KEY=bv_live_… node example.mjs
import { BrollviaClient, BrollviaError } from './brollvia.mjs';

const bv = new BrollviaClient({
  baseUrl: process.env.BROLLVIA_BASE || 'https://brollvia.com',
  apiKey: process.env.BROLLVIA_KEY || '',
});

try {
  const me = await bv.me();
  console.log('Connected as', me.name, '— plan:', me.plan.name);

  const { assets, total } = await bv.search({ q: 'harbour at dawn', type: 'video', per_page: 5 });
  console.log(total, 'matches; first five:');
  for (const a of assets) console.log(' -', a.id, a.title, '(' + a.tier + ')');

  if (assets.length) {
    const dl = await bv.download(assets[0].id, { variant: 'hd', to: './' + (assets[0].slug || 'asset') + '.bin' });
    console.log('Downloaded', dl.bytes.length, 'bytes; licence:', dl.licence.code, '→', dl.licence.certificate_url);
  }

  const beats = await bv.suggestBroll('EXT. HARBOUR — DAWN\nWaves roll over the empty pier.');
  for (const b of beats.beats) console.log('Beat:', b.beat, '→', b.assets.length, 'suggestions');
} catch (e) {
  if (e instanceof BrollviaError) console.error('Brollvia error [' + e.code + ']', e.message);
  else throw e;
  process.exit(1);
}
