# Brollvia JavaScript SDK (v1.6.0)

A single-file, dependency-free ES module for the **Brollvia REST API v1**.
Runs in Node 18+ (built-in `fetch`) and modern browsers.

## Install

Download `brollvia-sdk-js.zip` from your Brollvia site's **Developers** page
(`/developers`) or the **Editors** page, unzip it, and import the module:

```js
import { BrollviaClient, BrollviaError } from './brollvia.mjs';
```

## Quick start

```js
const bv = new BrollviaClient({
  baseUrl: 'https://brollvia.com',   // your Brollvia site
  apiKey: 'bv_live_…',               // Dashboard → Developer (keep it secret)
});

const me = await bv.me();                       // who the key belongs to + plan
const { assets, total } = await bv.search({ q: 'harbour at dawn', type: 'video' });
const asset = await bv.getAsset(assets[0].id);  // full metadata
const dl = await bv.download(asset.id, { variant: 'hd' });
console.log(dl.bytes.length, dl.licence.code);  // licence recorded server-side
```

## API surface

| Method | What it does |
|---|---|
| `me()` | Account + plan behind the key |
| `usage()` | API/download usage vs plan limits |
| `search(params)` | Library search — `q, type, tier, orientation, shot_type, camera_movement, time_of_day, sort, per_page, cursor` |
| `getAsset(id)` | Full asset metadata (preview/display files only — licensed files move via `download()`) |
| `similar(id)` | "More like this" (v1.5 similarity engine) |
| `download(id, { variant, to })` | Licence-checked download; returns bytes + the licence record. `variant`: `'hd'` or `'original'`. `to`: optional file path (Node) |
| `listCollections()`, `getCollection(id)` | Your collections |
| `createCollection(title, opts)`, `addToCollection(id, assetId)`, `removeFromCollection(id, assetId)` | Collection writes (need the `collections:write` scope) |
| `suggestBroll(script, { perBeat, saveAs })` | Script-to-B-roll shot suggestions; `saveAs` also saves a collection |
| `getLicence(id)`, `licencePdf(id)` | Licence record / certificate PDF bytes |

## Errors

Failures raise `BrollviaError` with `.status`, `.code` and the API's plain
message — e.g. a Pro asset on a Free key raises the same "Pro library"
message the website shows, and **no licence is recorded and no bytes are
downloaded** in that case.

## Notes

- API keys are scoped (`read`, `download`, `collections:write`), quota'd by
  plan, and revocable at any time from Dashboard → Developer.
- The signed file URL returned by the download endpoint expires after 15
  minutes; the SDK follows it immediately.
- Version 1.6.0 matches Brollvia 1.6.0. The SDK talks to REST API **v1**,
  which is stable across the 1.x line.
