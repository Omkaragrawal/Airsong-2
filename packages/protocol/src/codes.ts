import { customAlphabet } from 'nanoid';

/** Session code characters. Look-alikes (I, L, O, 0, 1) are left out so codes are easy to read aloud and type. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const CODE_LENGTH = 6;

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

const createCode = customAlphabet(CODE_ALPHABET, CODE_LENGTH);

/** Returns a new random session code. */
export function generateCode(): string {
  return createCode();
}

/** Puts a typed code into its stored form: uppercase, with spaces and dashes removed. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[ -]/g, '');
}

/** Tells whether the input is a session code once normalized. */
export function isCode(input: string): boolean {
  return CODE_PATTERN.test(normalizeCode(input));
}
