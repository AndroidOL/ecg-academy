import assert from 'node:assert/strict';
import { ABBREVIATIONS, expandAbbreviations, abbreviationTerms } from '../public/static/js/abbreviations.js';

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (error) { console.error(`FAIL  ${name}: ${error.message}`); process.exitCode = 1; }
}

check('RBBB/LBBB expand to English full name with Chinese in parentheses', () => {
  assert.equal(
    expandAbbreviations('RBBB / LBBB'),
    'Right Bundle Branch Block（完全性右束支传导阻滞） / Left Bundle Branch Block（完全性左束支传导阻滞）',
  );
});

check('STEMI and ACS expand without touching ordinary text', () => {
  assert.equal(
    expandAbbreviations('STEMI 与 ACS 患者'),
    'ST-Elevation Myocardial Infarction（ST 段抬高型心肌梗死） 与 Acute Coronary Syndrome（急性冠脉综合征） 患者',
  );
});

check('every abbreviation has English full name and Chinese explanation', () => {
  assert.ok(ABBREVIATIONS.length >= 40);
  for (const item of ABBREVIATIONS) {
    assert.ok(item.abbr);
    assert.ok(item.en && !/[()]/.test(item.en), `${item.abbr} English full name invalid`);
    assert.ok(/[\u3400-\u9fff]/.test(item.zh), `${item.abbr} Chinese missing`);
  }
  assert.equal(abbreviationTerms().length, ABBREVIATIONS.length);
});

console.log(`\nAbbreviation tests passed: ${passed}`);
