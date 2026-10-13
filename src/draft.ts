import { predict, type HeroModel } from './model.ts';

export function recommend(model: HeroModel, value: unknown) {
  if (!value || typeof value !== 'object' || !('teamA' in value) || !('teamB' in value)
    || !Array.isArray(value.teamA) || !Array.isArray(value.teamB) || value.teamA.length >= 6 || value.teamB.length > 6
    || Object.keys(value).sort().join(',') !== 'teamA,teamB') throw new Error('Drafting requires zero to five own heroes and zero to six opposing heroes.');
  const a: number[] = value.teamA, b: number[] = value.teamB, chosen = [...a, ...b];
  if (new Set(chosen).size !== chosen.length || chosen.some(id => !Number.isSafeInteger(id) || id <= 0 || !Object.hasOwn(model.weights,id))) throw new Error('Draft heroes must be distinct and supported by this model.');
  const pool = Object.keys(model.weights).map(Number).sort((a,b)=>a-b).filter(id=>!chosen.includes(id));
  if (pool.length < 12 - chosen.length) throw new Error('Not enough supported heroes to complete these teams.');
  const samples = 256;
  let seed = 42;
  const orders = Array.from({length:samples},()=>{
    const order=[...pool];
    for(let i=order.length-1;i>0;i--) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const j=Math.floor(seed/4294967296*(i+1)); [order[i],order[j]]=[order[j],order[i]];
    }
    return order;
  });
  return pool.map(heroId=>{
    let total=0;
    for(const order of orders) {
      const rest=order.filter(id=>id!==heroId), ownMissing=5-a.length;
      total+=predict(model,{teamA:[...a,heroId,...rest.slice(0,ownMissing)],teamB:[...b,...rest.slice(ownMissing,ownMissing+6-b.length)]});
    }
    return {heroId,probability:total/samples,trainingAppearances:model.counts[heroId]};
  }).sort((x,y)=>y.probability-x.probability||x.heroId-y.heroId).slice(0,5);
}
