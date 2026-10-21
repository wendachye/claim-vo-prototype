// Encode as a CSS string, not an identifier. This also keeps claim references
// containing quotes, controls or markup from changing the print stylesheet.
export function claimPrintReferenceRule(reference) {
  const content = Array.from(`Claim ref: ${reference}`, (character) => `\\${character.codePointAt(0).toString(16)} `).join('');
  return `@page claim-pack { @bottom-left { content: "${content}"; } }`;
}
