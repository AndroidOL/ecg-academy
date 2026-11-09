export const LEVEL_THRESHOLDS = [0, 80, 200, 400, 700, 1100, 1600, 2200, 3000, 4000, 5200, 6600, 8200, 10000, 12000, 14500, 17500, 21000, 25000, 30000];
export const MAX_LEVEL = LEVEL_THRESHOLDS.length;
export const ADVANCED_UNLOCK = 5;
export const CHALLENGE_UNLOCK = 8;
export const AI_UNLOCK = 10;

export function levelFromXp(xp) {
  const value = Math.max(0, Number(xp) || 0);
  let level = 1;
  LEVEL_THRESHOLDS.forEach((threshold, index) => {
    if (value >= threshold) level = index + 1;
  });
  return level;
}

export function levelInfo(xp) {
  const value = Math.max(0, Number(xp) || 0);
  const level = levelFromXp(value);
  const start = LEVEL_THRESHOLDS[level - 1] || 0;
  const next = level < MAX_LEVEL ? LEVEL_THRESHOLDS[level] : null;
  const progress = next === null ? 100 : Math.round(((value - start) / Math.max(1, next - start)) * 100);
  return {
    level,
    xp: value,
    levelStart: start,
    nextXp: next,
    progress: Math.max(0, Math.min(100, progress)),
    isMax: next === null,
    advancedOpen: level >= ADVANCED_UNLOCK,
    challengeOpen: level >= CHALLENGE_UNLOCK,
    aiOpen: level >= AI_UNLOCK,
  };
}
