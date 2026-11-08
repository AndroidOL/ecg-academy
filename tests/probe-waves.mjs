import { generateLead } from '../public/static/js/ecg-engine.js';
const spec = { rhythm:'sinus', rate:72, atrialRate:72, p:'normal', pr:0.16, qrs:0.08, morphology:'normal', axis:'normal', st:{elevation:{},depression:{},shape:'normal'}, t:{shape:'normal',amp:1}, qt:0.38, duration:8, seed:11, annotations:[], extras:[] };
for (const lead of ['II','V1','V5']) {
  const r = generateLead(spec, lead);
  const s = r.samples;
  const at = (t) => s[Math.round(t*500)];
  console.log(lead, 'P(.42)=', at(.42).toFixed(3), 'R(.58)=', at(.58).toFixed(3), 'T(.83)=', at(.83).toFixed(3));
  const win = (a,b) => { let mi=0,ma=0; for(let i=Math.round(a*500);i<Math.round(b*500);i++){ if(s[i]<mi)mi=s[i]; if(s[i]>ma)ma=s[i]; } return [mi.toFixed(3),ma.toFixed(3)]; };
  console.log('  P window', win(0.32,0.54), 'QRS', win(0.52,0.68), 'T', win(0.7,1.0));
}
