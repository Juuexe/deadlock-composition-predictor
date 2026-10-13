import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/server.ts';
import { parseModel } from '../src/model.ts';
import { parseHeroes } from '../src/heroes.ts';

let app: ReturnType<typeof createApp>;
export default function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    app ??= createApp(parseModel(JSON.parse(process.env.MODEL_JSON ?? 'null')),parseHeroes(JSON.parse(process.env.HEROES_JSON ?? 'null')));
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
