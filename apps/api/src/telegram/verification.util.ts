// Generates local verification challenges (no third-party deps).
// Turnstile / reCAPTCHA / AI scoring are stubbed and validated server-side
// only when real keys are configured.

export interface Challenge {
  prompt: string;
  answer: string;
  options?: string[]; // for button/multiple-choice style
}

export function makeMathChallenge(): Challenge {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const answer = String(a + b);
  // produce 4 options including the correct one
  const set = new Set<string>([answer]);
  while (set.size < 4) {
    set.add(String(a + b + (Math.floor(Math.random() * 9) - 4)));
  }
  const options = shuffle([...set]);
  return { prompt: `请回答：${a} + ${b} = ?`, answer, options };
}

export function makeCaptchaChallenge(): Challenge {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return { prompt: `请输入下方验证码：\n\n\`${code}\``, answer: code };
}

export function makeButtonChallenge(): Challenge {
  // simple "I am human" tap
  return { prompt: '请点击下方按钮完成人机验证。', answer: 'human' };
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
