export const CODE_LENGTH = 8;
export const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export type RandomIntFn = (maxExclusive: number) => number;

function defaultRandomInt(maxExclusive: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % maxExclusive;
}

export function generateCode(randomInt: RandomIntFn = defaultRandomInt): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}
