// English full names are primary; Chinese explanations in full-width parentheses.
export const ABBREVIATIONS = [
  { abbr: 'ECG', en: 'Electrocardiogram', zh: '心电图' },
  { abbr: 'QRS', en: 'QRS Complex', zh: 'QRS 波群' },
  { abbr: 'PR', en: 'PR Interval', zh: 'PR 间期' },
  { abbr: 'QT', en: 'QT Interval', zh: 'QT 间期' },
  { abbr: 'QTc', en: 'Corrected QT Interval', zh: '校正 QT 间期' },
  { abbr: 'RR', en: 'RR Interval', zh: 'RR 间期' },
  { abbr: 'PP', en: 'PP Interval', zh: 'PP 间期' },
  { abbr: 'RBBB', en: 'Right Bundle Branch Block', zh: '完全性右束支传导阻滞' },
  { abbr: 'LBBB', en: 'Left Bundle Branch Block', zh: '完全性左束支传导阻滞' },
  { abbr: 'LAFB', en: 'Left Anterior Fascicular Block', zh: '左前分支传导阻滞' },
  { abbr: 'LPFB', en: 'Left Posterior Fascicular Block', zh: '左后分支传导阻滞' },
  { abbr: 'AVB', en: 'Atrioventricular Block', zh: '房室传导阻滞' },
  { abbr: 'AVNRT', en: 'Atrioventricular Nodal Reentrant Tachycardia', zh: '房室结折返性心动过速' },
  { abbr: 'AVRT', en: 'Atrioventricular Reentrant Tachycardia', zh: '房室折返性心动过速' },
  { abbr: 'SVT', en: 'Supraventricular Tachycardia', zh: '室上性心动过速' },
  { abbr: 'VT', en: 'Ventricular Tachycardia', zh: '室性心动过速' },
  { abbr: 'VF', en: 'Ventricular Fibrillation', zh: '心室颤动' },
  { abbr: 'TdP', en: 'Torsades de Pointes', zh: '尖端扭转型室速' },
  { abbr: 'AF', en: 'Atrial Fibrillation', zh: '心房颤动' },
  { abbr: 'AFL', en: 'Atrial Flutter', zh: '心房扑动' },
  { abbr: 'PVC', en: 'Premature Ventricular Contraction', zh: '室性期前收缩' },
  { abbr: 'PAC', en: 'Premature Atrial Contraction', zh: '房性期前收缩' },
  { abbr: 'PJC', en: 'Premature Junctional Contraction', zh: '交界性期前收缩' },
  { abbr: 'STEMI', en: 'ST-Elevation Myocardial Infarction', zh: 'ST 段抬高型心肌梗死' },
  { abbr: 'NSTEMI', en: 'Non-ST-Elevation Myocardial Infarction', zh: '非 ST 段抬高型心肌梗死' },
  { abbr: 'ACS', en: 'Acute Coronary Syndrome', zh: '急性冠脉综合征' },
  { abbr: 'PE', en: 'Pulmonary Embolism', zh: '肺栓塞' },
  { abbr: 'PCI', en: 'Percutaneous Coronary Intervention', zh: '经皮冠状动脉介入治疗' },
  { abbr: 'CABG', en: 'Coronary Artery Bypass Grafting', zh: '冠状动脉旁路移植术' },
  { abbr: 'CPR', en: 'Cardiopulmonary Resuscitation', zh: '心肺复苏' },
  { abbr: 'ACLS', en: 'Advanced Cardiovascular Life Support', zh: '高级心血管生命支持' },
  { abbr: 'PEA', en: 'Pulseless Electrical Activity', zh: '无脉电活动' },
  { abbr: 'ROSC', en: 'Return of Spontaneous Circulation', zh: '自主循环恢复' },
  { abbr: 'CRT', en: 'Cardiac Resynchronization Therapy', zh: '心脏再同步治疗' },
  { abbr: 'ICD', en: 'Implantable Cardioverter-Defibrillator', zh: '植入式心律转复除颤器' },
  { abbr: 'HCM', en: 'Hypertrophic Cardiomyopathy', zh: '肥厚型心肌病' },
  { abbr: 'ARVC', en: 'Arrhythmogenic Right Ventricular Cardiomyopathy', zh: '致心律失常性右室心肌病' },
  { abbr: 'CPVT', en: 'Catecholaminergic Polymorphic Ventricular Tachycardia', zh: '儿茶酚胺敏感性多形性室速' },
  { abbr: 'LQTS', en: 'Long QT Syndrome', zh: '长 QT 综合征' },
  { abbr: 'SQTS', en: 'Short QT Syndrome', zh: '短 QT 综合征' },
  { abbr: 'WPW', en: 'Wolff-Parkinson-White Syndrome', zh: 'Wolff-Parkinson-White 综合征' },
  { abbr: 'LVH', en: 'Left Ventricular Hypertrophy', zh: '左心室肥厚' },
  { abbr: 'RVH', en: 'Right Ventricular Hypertrophy', zh: '右心室肥厚' },
  { abbr: 'LAE', en: 'Left Atrial Enlargement', zh: '左心房增大' },
  { abbr: 'RAE', en: 'Right Atrial Enlargement', zh: '右心房增大' },
  { abbr: 'AIVR', en: 'Accelerated Idioventricular Rhythm', zh: '加速性室性自主心律' },
  { abbr: 'EPS', en: 'Electrophysiology Study', zh: '电生理检查' },
  { abbr: 'EP', en: 'Electrophysiology', zh: '电生理' },
  { abbr: 'VVI', en: 'Ventricular Demand Pacing', zh: '心室按需起搏' },
  { abbr: 'DDD', en: 'Dual-Chamber Pacing', zh: '双腔起搏' },
  { abbr: 'AAI', en: 'Atrial Demand Pacing', zh: '心房按需起搏' },
  { abbr: 'LVEF', en: 'Left Ventricular Ejection Fraction', zh: '左心室射血分数' },
  { abbr: 'EF', en: 'Ejection Fraction', zh: '射血分数' },
];

const MAP = new Map(ABBREVIATIONS.map((item) => [item.abbr, item]));
const PATTERN = new RegExp(`\\b(${[...MAP.keys()].sort((a, b) => b.length - a.length).join('|')})\\b`, 'g');

export function expandAbbreviations(text) {
  if (typeof text !== 'string' || text === '') return text;
  return text.replace(PATTERN, (abbr) => {
    const item = MAP.get(abbr);
    return item ? `${item.en}（${item.zh}）` : abbr;
  });
}

export function abbreviationTerms() {
  return ABBREVIATIONS.map((item) => ({
    category: '缩写',
    en: item.en,
    zh: item.zh,
    definition: `${item.abbr}：${item.en}（${item.zh}）`,
    abbr: item.abbr,
  }));
}
