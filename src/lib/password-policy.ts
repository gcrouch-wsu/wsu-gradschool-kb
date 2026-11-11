/**
 * Password policy for managed KB users.
 *
 * Follows current NIST SP 800-63B guidance: length over composition. A long, readable passphrase
 * ("purple gradschool coffee") is accepted; forced symbol/uppercase/digit rules are deliberately
 * absent because they push people toward `Password1!`. What *is* rejected is short, obvious, or
 * account-derived passwords. Passwords are only ever stored as salted scrypt hashes
 * (src/lib/auth.ts), so nothing here is about storage.
 *
 * This module is shared by the API routes (authoritative) and the admin forms (early hint), so it
 * must stay free of Node-only imports.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_POLICY_HINT = `At least ${PASSWORD_MIN_LENGTH} characters. A few words with spaces or dashes works well — no symbols required.`;

/**
 * Obvious choices, compared after normalising (lowercase, letters only — so `Password123!`,
 * `pass word 2026`, and `P@ssword` all collapse onto `password`). Kept short on purpose: the
 * length rule already does most of the work, this only closes the "long but obvious" gap.
 */
const COMMON_BASES = new Set([
  "password",
  "passw",
  "passwd",
  "passphrase",
  "qwerty",
  "qwertyuiop",
  "asdfgh",
  "asdfghjkl",
  "zxcvbnm",
  "abcdef",
  "abcdefgh",
  "abcdefghijkl",
  "abc",
  "letmein",
  "welcome",
  "welcometowsu",
  "changeme",
  "changemenow",
  "admin",
  "administrator",
  "iloveyou",
  "monkey",
  "dragon",
  "sunshine",
  "football",
  "baseball",
  "princess",
  "trustno",
  "secret",
  "default",
  "temp",
  "temppassword",
  "test",
  "testing",
  "wsu",
  "wazzu",
  "cougar",
  "cougars",
  "gocougs",
  "gocougars",
  "pullman",
  "washingtonstate",
  "washingtonstateuniversity",
  "gradschool",
  "graduateschool",
  "wsugradschool",
  "wsugraduateschool",
  "knowledgebase",
  "wsukb",
  "kbadmin",
  "fall",
  "spring",
  "summer",
  "winter",
]);

const LEET_DIGITS: Record<string, string> = { "0": "o", "1": "l", "3": "e" };

/**
 * Letters only, lowercased, with common leetspeak folded back to letters. Digits are folded only
 * when sandwiched between letters (`p@ssw0rd`), so trailing padding like `Password123` is
 * stripped rather than turned into `passwordlze`.
 */
function lettersOnly(value: string): string {
  return value
    .toLowerCase()
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/(?<=[a-z])[013](?=[a-z])/g, (digit) => LEET_DIGITS[digit])
    .replace(/[^a-z]/g, "");
}

export interface PasswordContext {
  email?: string | null;
  fullName?: string | null;
}

/**
 * Returns a human-readable reason the password is not acceptable, or null when it is.
 */
export function validatePassword(password: unknown, context: PasswordContext = {}): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return "Enter a password.";
  }
  if (password.trim().length !== password.length) {
    return "Password cannot start or end with a space.";
  }
  // Count code points, not UTF-16 units, so an emoji is one character as a reader sees it.
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters (it has ${length}).`;
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }

  const distinct = new Set(Array.from(password.toLowerCase().replace(/\s/g, ""))).size;
  if (distinct < 5) {
    return "Password is too repetitive. Try a few different words.";
  }

  const base = lettersOnly(password);
  if (base.length === 0 || COMMON_BASES.has(base)) {
    return "That password is too common. Try a few unrelated words instead.";
  }
  // Catch repeats of a common base: "passwordpassword", "cougarcougar".
  for (const common of COMMON_BASES) {
    if (common.length >= 3 && base.length % common.length === 0 && common.repeat(base.length / common.length) === base) {
      return "That password is too common. Try a few unrelated words instead.";
    }
  }

  const localPart = (context.email ?? "").split("@")[0]?.toLowerCase() ?? "";
  const localLetters = lettersOnly(localPart);
  if (localLetters.length >= 4 && base.includes(localLetters)) {
    return "Password cannot contain the account's email name.";
  }
  const nameParts = (context.fullName ?? "")
    .split(/\s+/)
    .map(lettersOnly)
    .filter((part) => part.length >= 4);
  if (
    nameParts.some(
      (part) => base.length % part.length === 0 && part.repeat(base.length / part.length) === base,
    )
  ) {
    return "Password cannot be just the person's name.";
  }

  return null;
}

/**
 * Short, common, easy-to-spell words for suggested passphrases. 256 entries, so each word adds
 * exactly 8 bits; four words plus a two-digit number is ~38.6 bits, which — behind the sign-in
 * rate limit (10 attempts / 15 min per client and account) — is far beyond online guessing.
 */
const PASSPHRASE_WORDS = [
  "acorn", "adobe", "agent", "alarm", "album", "alpine", "amber", "anchor",
  "apple", "apron", "arbor", "arena", "arrow", "aspen", "atlas", "attic",
  "badge", "bagel", "bakery", "balcony", "bamboo", "banjo", "barley", "basin",
  "beacon", "beaver", "bench", "berry", "bison", "blanket", "bloom", "bluff",
  "bonfire", "border", "bottle", "boulder", "branch", "breeze", "brick", "bridge",
  "brook", "bucket", "buffalo", "bundle", "butter", "cabin", "cactus", "camera",
  "canal", "candle", "canoe", "canyon", "carpet", "castle", "cedar", "cellar",
  "chalk", "channel", "cherry", "chess", "chimney", "cider", "circle", "citrus",
  "clover", "cobalt", "cocoa", "comet", "compass", "copper", "coral", "cotton",
  "cougar", "cradle", "crane", "crater", "crayon", "creek", "cricket", "crystal",
  "cupboard", "daisy", "delta", "desert", "dolphin", "domino", "dragonfly", "drum",
  "dune", "eagle", "easel", "echo", "elbow", "ember", "engine", "falcon",
  "feather", "fern", "fiddle", "field", "flannel", "fjord", "flint", "forest",
  "fossil", "fountain", "fox", "frost", "galaxy", "garden", "garnet", "geyser",
  "ginger", "glacier", "globe", "granite", "grape", "gravel", "griddle", "grove",
  "guitar", "harbor", "harvest", "hazel", "heron", "hickory", "honey", "horizon",
  "husky", "igloo", "indigo", "island", "ivory", "jacket", "jasmine", "jigsaw",
  "juniper", "kettle", "kayak", "kernel", "kiwi", "ladder", "lagoon", "lantern",
  "laurel", "lemon", "lilac", "linen", "lobster", "locket", "lotus", "lumber",
  "magnet", "mango", "maple", "marble", "meadow", "melon", "mesa", "meteor",
  "mitten", "monsoon", "mosaic", "mountain", "muffin", "nectar", "nickel", "nutmeg",
  "oasis", "oatmeal", "ocean", "olive", "onion", "orbit", "orchard", "otter",
  "paddle", "palouse", "panda", "paper", "parade", "parcel", "pebble", "pecan",
  "pepper", "piano", "pickle", "pillow", "pine", "planet", "plaza", "pocket",
  "pony", "poppy", "prairie", "pretzel", "prism", "puzzle", "quarry", "quill",
  "quilt", "radar", "radish", "raven", "ribbon", "ridge", "river", "rocket",
  "saddle", "salmon", "sandal", "satchel", "scarf", "shovel", "silver", "sketch",
  "sparrow", "spruce", "summit", "sunset", "teapot", "thistle", "thunder", "timber",
  "toast", "topaz", "trail", "tulip", "tundra", "turnip", "valley", "velvet",
  "violet", "voyage", "waffle", "walnut", "wheat", "willow", "window", "zephyr",
  "almond", "beetle", "biscuit", "caramel", "dandelion", "emerald", "goblet", "hammock",
  "iris", "jelly", "kitten", "mustard", "noodle", "pumpkin", "rhubarb", "sapphire",
];

function randomIndex(max: number): number {
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0] < limit) {
      return buffer[0] % max;
    }
  }
}

/** A readable passphrase such as `maple-river-lantern-otter-42`. */
export function generatePassphrase(wordCount = 4): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i += 1) {
    words.push(PASSPHRASE_WORDS[randomIndex(PASSPHRASE_WORDS.length)]);
  }
  const number = String(10 + randomIndex(90));
  return [...words, number].join("-");
}

export const PASSPHRASE_WORD_COUNT_FOR_TESTS = new Set(PASSPHRASE_WORDS).size;
