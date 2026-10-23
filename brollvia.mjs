/**
 * Brollvia JavaScript SDK — v1.6.0
 *
 * A tiny, dependency-free ESM client for the Brollvia REST API v1.
 * Works in Node 18+ (global fetch) and modern browsers.
 *
 *   import { BrollviaClient, BrollviaError } from './brollvia.mjs';
 *   const bv = new BrollviaClient({ baseUrl: 'https://brollvia.com', apiKey: 'bv_live_…' });
 *   const { assets } = await bv.search({ q: 'harbour at dawn', type: 'video' });
 *   const dl = await bv.download(assets[0].id, { variant: 'hd' });
 *   // dl.bytes (Uint8Array), dl.licence (the server-side licence record)
 *
 * Every download goes through the API's licence-checked endpoint: the
 * licence record is written on the server BEFORE the bytes move, exactly
 * like a download from the website.
 */

export class BrollviaError extends Error {
  constructor(message, { status = 0, code = 'network_error', payload = null } = {}) {
    super(message);
    this.name = 'BrollviaError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export class BrollviaClient {
  /**
   * @param {{ baseUrl: string, apiKey: string, fetchImpl?: Function }} opts
   */
  constructor({ baseUrl, apiKey, fetchImpl } = {}) {
    if (!baseUrl) throw new BrollviaError('BrollviaClient needs a baseUrl, e.g. https://brollvia.com');
    if (!apiKey) throw new BrollviaError('BrollviaClient needs an apiKey (Dashboard → Developer on your Brollvia site).');
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.apiKey = String(apiKey);
    this._fetch = fetchImpl || globalThis.fetch;
    if (typeof this._fetch !== 'function') throw new BrollviaError('No fetch implementation available — use Node 18+ or pass fetchImpl.');
  }

  async _request(path, { method = 'GET', body, raw = false } = {}) {
    let res;
    try {
      res = await this._fetch(this.baseUrl + '/api/v1/' + path, {
        method,
        headers: {
          'Authorization': 'Bearer ' + this.apiKey,
          'Accept': 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new BrollviaError('Could not reach ' + this.baseUrl + ': ' + e.message, { code: 'network_error' });
    }
    if (raw) return res;
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* leave null */ }
    if (!res.ok) {
      const msg = json?.error?.message || ('Brollvia API answered HTTP ' + res.status);
      throw new BrollviaError(msg, { status: res.status, code: json?.error?.code || 'http_error', payload: json });
    }
    return json;
  }

  /** Who am I? → { id, name, email, plan: {...}, key: {...} } */
  async me() { return (await this._request('me')).data; }

  /** Usage counters for this key (plan, hourly/monthly limits, downloads today). */
  async usage() { return (await this._request('me/usage')).data; }

  /**
   * Search the library.
   * @param {{ q?: string, type?: 'video'|'photo'|'audio', tier?: 'free'|'pro',
   *           orientation?: string, shot_type?: string, camera_movement?: string,
   *           time_of_day?: string, sort?: string, per_page?: number, cursor?: string }} params
   * @returns {Promise<{ assets: object[], total: number, nextCursor: string|null }>}
   */
  async search(params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const r = await this._request('search?' + qs.toString());
    return { assets: r.data, total: r.meta?.total ?? r.data.length, nextCursor: r.meta?.next_cursor ?? null };
  }

  /** Full asset record (metadata, tags, preview/display files — never hd/original URLs). */
  async getAsset(id) { return (await this._request('assets/' + encodeURIComponent(id))).data; }

  /** Assets similar to the given one (v1.5 similarity engine). */
  async similar(id, perPage = 12) {
    const r = await this._request('assets/' + encodeURIComponent(id) + '/similar?per_page=' + perPage);
    return r.data;
  }

  /**
   * Licence-checked download of one asset.
   * Records the licence server-side, fetches the signed file URL and
   * returns the bytes. Pass { to: 'path/to/file' } in Node to also write
   * the file to disk (the bytes are still returned).
   * @returns {Promise<{ bytes: Uint8Array, filename: string|null, contentType: string,
   *                     variant: string, licence: object, path?: string }>}
   */
  async download(id, { variant = 'hd', to = null } = {}) {
    const grant = (await this._request('assets/' + encodeURIComponent(id) + '/download', {
      method: 'POST', body: { variant },
    })).data;
    let res;
    try { res = await this._fetch(grant.download_url); }
    catch (e) { throw new BrollviaError('Licence ' + (grant.licence?.code || '') + ' was recorded, but the file fetch failed: ' + e.message, { code: 'download_fetch_failed' }); }
    if (!res.ok) throw new BrollviaError('The signed download URL answered HTTP ' + res.status + ' (it expires in 15 minutes — call download() again).', { status: res.status, code: 'download_fetch_failed' });
    const buf = new Uint8Array(await res.arrayBuffer());
    const cd = res.headers.get('content-disposition') || '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    const out = {
      bytes: buf,
      filename: m ? decodeURIComponent(m[1].trim()) : null,
      contentType: res.headers.get('content-type') || '',
      variant: grant.variant,
      licence: grant.licence,
    };
    if (to) {
      const fs = await import('node:fs/promises');
      await fs.writeFile(to, buf);
      out.path = to;
    }
    return out;
  }

  /** My collections (pass { public: true } for the public listing instead). */
  async listCollections({ public: pub = false } = {}) {
    const r = await this._request('collections' + (pub ? '?public=1' : ''));
    return r.data;
  }

  /** Create a collection. Requires the collections:write scope. */
  async createCollection(title, { description = null, isPublic = false } = {}) {
    const body = { title };
    if (description !== null) body.description = description;
    body.is_public = isPublic;
    return (await this._request('collections', { method: 'POST', body })).data;
  }

  /** One collection, with its assets. */
  async getCollection(id) { return (await this._request('collections/' + encodeURIComponent(id))).data; }

  /** Add an asset to a collection (idempotent server-side). */
  async addToCollection(collectionId, assetId) {
    return (await this._request('collections/' + encodeURIComponent(collectionId) + '/assets', {
      method: 'POST', body: { asset_id: assetId },
    })).data;
  }

  /** Remove an asset from a collection. */
  async removeFromCollection(collectionId, assetId) {
    return (await this._request('collections/' + encodeURIComponent(collectionId) + '/assets/' + encodeURIComponent(assetId), {
      method: 'DELETE',
    })).data;
  }

  /**
   * Script-to-B-roll: turn script lines into shot suggestions.
   * @param {string} script
   * @param {{ perBeat?: number, saveAs?: string }} opts — saveAs also
   *   saves the top pick per beat as a collection (needs collections:write).
   * @returns {Promise<{ beats: Array<{beat: string, query: string, assets: object[]}>, collection: object|null }>}
   */
  async suggestBroll(script, { perBeat = 3, saveAs = null } = {}) {
    const body = { script, per_beat: perBeat };
    if (saveAs) body.save_as = saveAs;
    const r = await this._request('script/suggest', { method: 'POST', body });
    return r.data;
  }

  /** Fetch a licence record (JSON) or certificate (`licencePdf(id)` for bytes). */
  async getLicence(id) { return (await this._request('licences/' + encodeURIComponent(id))).data; }

  async licencePdf(id) {
    const res = await this._request('licences/' + encodeURIComponent(id) + '?format=pdf', { raw: true });
    if (!res.ok) throw new BrollviaError('Licence PDF request failed (HTTP ' + res.status + ').', { status: res.status, code: 'http_error' });
    return new Uint8Array(await res.arrayBuffer());
  }
}

export default BrollviaClient;
