// Arithmetics (Connected Calc, CCC_*) — exact port of the original original game binary chain generator:
//   firstValue / nextStep   FUN_4a11080c   next operation of the chain
//   acceptable              FUN_4a10ea90   difficulty-dependent operand rules
//   totalScore              FUN_4a11423c   right*R + wrong*W + seconds*T
// Operations: 0 '+', 1 '-', 2 '*', 3 '/'.
export const OPS = ['+', '-', '*', '/'];

const rnd = (rand, n) => n > 0 ? (rand() % 0x7fff) % n : 0;

export function levelParams(level) {
  const n = key => Number(String(level[key]).trim());
  const ops = String(level.m_Ops).trim().split(/\s+/).map(Number);
  return {min: n('m_nMinLevValue'), max: n('m_nMaxLevValue'), steps: n('m_nChainCount'),
    minOperand: n('m_nMinOperand'), ops: ops.slice(1, 1 + ops[0])};
}

export function firstValue(p, rand) { return p.min + rnd(rand, p.max - p.min); }

function addition(a, p, rand) {
  const room = p.max - a;
  const b = room === p.minOperand ? room : room >= p.minOperand ? p.minOperand + rnd(rand, room - p.minOperand) : p.max;
  return {op: 0, b, result: a + b};
}
function subtraction(a, p, rand) {
  const room = a - p.min;
  const b = room === p.minOperand ? room : room >= p.minOperand ? p.minOperand + rnd(rand, room - p.minOperand) : p.min;
  return {op: 1, b, result: a - b};
}
const addOrSub = (a, p, rand) => { const s = addition(a, p, rand); return s.result > p.max ? subtraction(a, p, rand) : s; };
const subOrAdd = (a, p, rand) => { const s = subtraction(a, p, rand); return s.result < p.min ? addition(a, p, rand) : s; };

function candidate(a, p, rand) {
  const op = p.ops[rnd(rand, p.ops.length)];
  if (op === 0) return addOrSub(a, p, rand);
  if (op === 1) return subOrAdd(a, p, rand);
  if (op === 2) {
    // Largest multiplier up to 9 that keeps the result within the level range.
    let b = 9;
    while (b > 1 && a * b > p.max) b--;
    if (b < 2 || a === 1 || a * b > p.max) return addOrSub(a, p, rand);
    return {op: 2, b, result: a * b};
  }
  // Largest divisor up to 9 that divides the value exactly.
  let b = 9;
  if (a % 9 !== 0) { b = 8; while (b > 1 && a % b !== 0) b--; }
  if (b === 1 || a / b < p.min) return subOrAdd(a, p, rand);
  return {op: 3, b, result: a / b};
}

// Easy (v2): no carrying or borrowing across tens, so a child can count in the head:
// 23 + 45 is fine, 27 + 45 is not; 45 - 23 is fine, 45 - 27 is not.
export function noCarry(step, a) {
  if (step.op === 0) return (a % 10) + (step.b % 10) < 10;
  if (step.op === 1) return (a % 10) >= (step.b % 10);
  return true;
}

// Medium and hard chains avoid round numbers and small operands for + and -.
export function acceptable(step, a, difficulty) {
  const k = difficulty % 3;
  if (step.op === 2) return k !== 2 || a % 10 !== 0;
  if (k === 0) return noCarry(step, a);
  if (step.op !== 0 && step.op !== 1) return true;
  const operand = step.op === 0 ? step.result - a : a - step.result;
  if (operand < (k === 1 ? 11 : 16)) return false;
  return step.result % 10 !== 0 && step.b % 10 !== 0;
}

export function nextStep(a, previous, p, difficulty, rand) {
  let step;
  for (let i = 0; i < 10000; i++) {
    step = candidate(a, p, rand);
    if (step.result !== previous && acceptable(step, a, difficulty)) break;
  }
  return {a, ...step};
}

export function totalScore(right, wrong, seconds, rightPoints, wrongPoints, timePoints) {
  return right * rightPoints + wrong * wrongPoints + seconds * timePoints;
}
