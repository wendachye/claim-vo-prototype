// Encode as a CSS string, not an identifier. This also keeps project names and
// references containing quotes, controls or markup inside their content value.
const cssString = (value) => `"${Array.from(value, (character) => `\\${character.codePointAt(0).toString(16)} `).join('')}"`;

export function claimPrintPageRule({ reference, projectName, claimMonth }) {
  return `@page claim-pack {
    @top-left { content: ${cssString(projectName)}; }
    @top-right { content: ${cssString(claimMonth)}; }
    @bottom-left { content: ${cssString(`Claim ref: ${reference}`)}; }
  }`;
}
