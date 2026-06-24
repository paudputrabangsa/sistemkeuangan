/**
 * Generates a deterministic pseudo-UUID based on a natural key (string).
 * This is synchronous, unlike Web Crypto API, making it easy to drop in 
 * as a replacement for crypto.randomUUID() without massive async refactoring.
 * 
 * Uses a simple 128-bit hash (based on multiple passes of FNV-1a/Murmur-like mixing)
 * to ensure high distribution and collision resistance for natural keys.
 */
export function generateDeterministicUUID(naturalKey: string): string {
  // Simple 32-bit FNV-1a hash generator
  function fnv1a32(str: string, seed: number = 0x811c9dc5): number {
    let hval = seed;
    for (let i = 0; i < str.length; i++) {
      hval ^= str.charCodeAt(i);
      hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    return hval >>> 0;
  }

  // Generate 4 distinct 32-bit integers by seeding the hash differently
  const h1 = fnv1a32(naturalKey, 0x811c9dc5);
  const h2 = fnv1a32(naturalKey, h1);
  const h3 = fnv1a32(naturalKey, h2);
  const h4 = fnv1a32(naturalKey, h3);

  // Convert to hex padded to 8 chars
  const hex1 = h1.toString(16).padStart(8, '0');
  const hex2 = h2.toString(16).padStart(8, '0');
  const hex3 = h3.toString(16).padStart(8, '0');
  const hex4 = h4.toString(16).padStart(8, '0');

  // Construct UUID format: 8-4-4-4-12
  // We'll set the version to 4 (pseudo-random) or 5 (namespace) for visual familiarity
  // format: xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
  // M = version (we'll use 'd' for deterministic)
  // N = variant (we'll use '8' for standard variant)
  
  const part1 = hex1;
  const part2 = hex2.slice(0, 4);
  const part3 = 'd' + hex2.slice(5, 8); // Version 'd'
  const part4 = (parseInt(hex3.slice(0, 1), 16) & 0x3 | 0x8).toString(16) + hex3.slice(1, 4); // Variant 8, 9, a, or b
  const part5 = hex3.slice(4, 8) + hex4;

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}
