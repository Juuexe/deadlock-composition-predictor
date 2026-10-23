import type { IncomingMessage, ServerResponse } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { createApp } from '../src/server.ts';
import { parseModel } from '../src/model.ts';
import { parseHeroes } from '../src/heroes.ts';

let app: ReturnType<typeof createApp>;
export default function handler(request: IncomingMessage, response: ServerResponse) {
  let stage = 'request';
  try {
    if (!app) {
      stage = 'model';
      const value = process.env.MODEL_JSON ?? 'null';
      const modelJson = value.startsWith('gzip:')
        ? gunzipSync(Buffer.from(value.slice(5), 'base64'), { maxOutputLength: 1048576 }).toString('utf8') : value;
      const model = parseModel(JSON.parse(modelJson));
      stage = 'catalog';
      const heroes = parseHeroes(JSON.parse(process.env.HEROES_JSON ?? 'null'));
      stage = 'app';
      app = createApp(model,heroes);
    }
    const url = new URL(request.url ?? '/', 'https://localhost');
    const route = url.searchParams.get('route');
    if(route) request.url=`/api/${route}`;
    app.emit('request',request,response);
  } catch (error) {
    console.error('Prediction service configuration unavailable.', { stage, errorType: error instanceof Error ? error.name : 'unknown',
      modelBytes: Buffer.byteLength(process.env.MODEL_JSON ?? ''), compressed: process.env.MODEL_JSON?.startsWith('gzip:') ?? false });
    response.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
    response.end(JSON.stringify({error:'Prediction service unavailable. Retry later.'}));
  }
}
