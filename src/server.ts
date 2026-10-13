import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseHeroes, type Hero } from './heroes.ts';
import { recommend } from './draft.ts';
import { predict, validateComposition, type HeroModel } from './model.ts';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function readJson(request: IncomingMessage): Promise<unknown> {
  if ('body' in request && request.body !== undefined) {
    const body = request.body;
    if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > 16384) return Promise.reject(new HttpError(413,'Request is too large.'));
    try { return Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body); }
    catch { return Promise.reject(new HttpError(400,'Invalid JSON.')); }
  }
  return new Promise((resolve, reject) => {
    let body = '', bytes = 0, failed = false;
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (failed) return;
      if (bytes > 16384) { failed = true; reject(new HttpError(413, 'Request is too large.')); return; }
      body += chunk.toString('utf8');
    });
    request.on('error', () => reject(new HttpError(400, 'Could not read the request.')));
    request.on('end', () => {
      if (failed) return;
      try { resolve(JSON.parse(body)); } catch { reject(new HttpError(400, 'Invalid JSON.')); }
    });
  });
}

export function createApp(model: HeroModel, inputHeroes: Hero[]) {
  const heroes = parseHeroes(inputHeroes);
  const modelHash = createHash('sha256').update(JSON.stringify(model)).digest('hex');
  const requests = new Map<string,{at:number;count:number}>();
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://assets-bucket.deadlock-api.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const json = (status: number, value: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    try {
      const path = request.url?.split('?')[0];
      if (request.method === 'POST') {
        const ip = request.socket.remoteAddress ?? 'unknown';
        const now = Date.now();
        for (const [key,value] of requests) if(now-value.at>60000) requests.delete(key);
        if(!requests.has(ip)&&requests.size>=1000) throw new HttpError(429,'Server is busy. Retry later.');
        const rate=requests.get(ip)??{at:now,count:0}; rate.count++; requests.set(ip,rate);
        if(rate.count>60) { response.setHeader('Retry-After','60'); throw new HttpError(429,'Too many requests. Retry in a minute.'); }
      }
      if (request.method === 'GET' && path === '/api/health') {
        json(200,{status:'ok',modelVersion:modelHash.slice(0,12)});
      } else if (request.method === 'GET' && path === '/api/evidence') {
        let reliability = null;
        try {
          const report = JSON.parse(await readFile('docs/reliability-evaluation.json', 'utf8'));
          if (report.modelSha256 === modelHash && report.overall && Number.isSafeInteger(report.overall.count)
            && report.overall.count > 0 && [report.coverage, report.overall.accuracy, report.overall.logLoss, report.overall.brierScore].every(Number.isFinite)
            && [report.generatedAt, report.frozenAt].every((date: unknown) => typeof date === 'string' && Number.isFinite(Date.parse(date)))) {
            reliability = { updatedAt: report.generatedAt, frozenAt: report.frozenAt, count: report.overall.count,
              accuracy: report.overall.accuracy, logLoss: report.overall.logLoss, brierScore: report.overall.brierScore,
              coverage: report.coverage, nextAnnouncement: report.nextAnnouncement ? { at: report.nextAnnouncement.at, title: report.nextAnnouncement.title } : null };
          }
        } catch { /* A missing or mismatched report must not imply evidence for this model. */ }
        json(200, { modelVersion: modelHash.slice(0, 12), modelKind: model.kind, reliability,
          unsupportedHeroes: heroes.filter(hero => !Object.hasOwn(model.weights, hero.id)).map(hero => hero.name) });
      } else if (request.method === 'GET' && path === '/api/heroes') {
        json(200, heroes.filter(hero => Object.hasOwn(model.weights, hero.id)));
      } else if (request.method === 'POST' && path === '/api/draft') {
        if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'Send application/json.');
        const input = await readJson(request);
        try { json(200,{ recommendations:recommend(model,input),samples:256,
          assumption:'Unfilled slots are sampled uniformly from supported, unpicked heroes. Draft estimates are not validated recommendations or causal improvements.' }); }
        catch(error) { throw new HttpError(400,error instanceof Error?error.message:'Invalid draft.'); }
      } else if (request.method === 'POST' && path === '/api/predict') {
        if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'Send application/json.');
        const input = await readJson(request);
        try {
          validateComposition(input);
          if (Object.keys(input).sort().join(',') !== 'teamA,teamB') throw new Error('Only hero compositions are accepted.');
          const probability = predict(model, input);
          json(200, {
            status: 'experimental', modelKind: model.kind, teamAWinProbability: probability, teamBWinProbability: 1 - probability,
            heroSupport: [...input.teamA, ...input.teamB].map(heroId => ({ heroId, trainingAppearances: model.counts[heroId] })),
          });
        } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid composition.'); }
      } else if (request.method === 'GET' && ['/', '/app.js', '/style.css'].includes(path ?? '')) {
        const file = path === '/' ? 'index.html' : path!.slice(1);
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'text/css';
        const content = await readFile(new URL(`../public/${file}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); response.end(content);
      } else json(404, { error: 'Not found.' });
    } catch (error) {
      json(error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Unable to complete the request.' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 15000;
  return server;
}
