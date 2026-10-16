import { evaluate, parseMatches, parseModel, predict, type HeroModel } from './model.ts';
import type { TrainingMatch } from './data.ts';

export const rosterPolicy = {
  version:'roster-expansion-v1', minimumMatches:500, minimumCoverage:0.95,
  rule:'Retain every incumbent hero. Candidate must beat 50/50 overall and for each added hero, and beat incumbent and 50/50 on common supported matches. Require 500 matches per cohort and 95% candidate coverage overall and within each cohort. Point-estimate gates; no reliability certification or automatic deployment.',
} as const;

export function evaluateRoster(candidate: HeroModel, incumbent: HeroModel, input: TrainingMatch[]) {
  parseModel(candidate);parseModel(incumbent);
  const rows=parseMatches(input);
  if(new Set(rows.map(row=>row.matchId)).size!==rows.length)throw new Error('Duplicate final-test matches.');
  if(Object.keys(incumbent.weights).some(id=>!Object.hasOwn(candidate.weights,id)))throw new Error('Candidate must retain all incumbent heroes.');
  const added=Object.keys(candidate.weights).map(Number).filter(id=>!Object.hasOwn(incumbent.weights,id));
  if(!added.length)throw new Error('Roster comparison requires added heroes.');
  const supports=(model:HeroModel,row:TrainingMatch)=>[...row.teamA,...row.teamB].every(id=>Object.hasOwn(model.weights,id));
  const cohort=(eligible:TrainingMatch[],compareIncumbent=false)=>{
    const supported=eligible.filter(row=>supports(candidate,row));
    const score=supported.length?evaluate(supported,row=>predict(candidate,row)):null;
    const coin=supported.length?evaluate(supported,()=>0.5):null;
    const old=compareIncumbent&&supported.length?evaluate(supported,row=>predict(incumbent,row)):null;
    const coverage=eligible.length?supported.length/eligible.length:0;
    const passed=Boolean(score&&coin&&score.count>=rosterPolicy.minimumMatches&&coverage>=rosterPolicy.minimumCoverage
      &&score.logLoss<coin.logLoss&&score.brierScore<coin.brierScore
      &&(!old||(score.logLoss<old.logLoss&&score.brierScore<old.brierScore)));
    return {total:eligible.length,coverage,candidate:score,coinFlip:coin,incumbent:old,passed};
  };
  const overall=cohort(rows),common=cohort(rows.filter(row=>supports(incumbent,row)),true);
  const newHeroes=added.map(heroId=>({heroId,...cohort(rows.filter(row=>[...row.teamA,...row.teamB].includes(heroId)))}));
  return {policy:rosterPolicy,overall,common,newHeroes,passed:overall.passed&&common.passed&&newHeroes.every(hero=>hero.passed)};
}
