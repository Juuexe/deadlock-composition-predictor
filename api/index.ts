import type { IncomingMessage, ServerResponse } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { createApp } from '../src/server.ts';
import { parseModel } from '../src/model.ts';
import { parseHeroes } from '../src/heroes.ts';

let app: ReturnType<typeof createApp>;
export default function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    if (!app) {
      const value = process.env.MODEL_JSON ?? 'null';
      const modelJson = value.startsWith('gzip:')
        ? gunzipSync(Buffer.from(value.slice(5), 'base64'), { maxOutputLength: 1048576 }).toString('utf8') : value;
      app = createApp(parseModel(JSON.parse(modelJson)),parseHeroes(JSON.parse(process.env.HEROES_JSON ?? 'null')));
    }
    const url = new URL(request.url ?? '/', 'https://localhost');
    const route = url.searchParams.get('route');
    if(route) request.url=`/api/${route}`;
    app.emit('request',request,response);
  } catch {
    console.error('Prediction service configuration unavailable.');
    response.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
    response.end(JSON.stringify({error:'Prediction service unavailable. Retry later.'}));
  }
}
