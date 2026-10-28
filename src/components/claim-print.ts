// Encode as a CSS string, not an identifier. This also keeps project names and
// references containing quotes, controls or markup inside their content value.
const cssString = (value: string) => `"${Array.from(value, (character) => `\\${character.codePointAt(0)!.toString(16)} `).join('')}"`;

// Chrome's generated page-margin text does not wrap long tokens reliably.
// Insert print-only breaks, retaining every character. Prefer a nearby word or
// separator boundary only when the remaining text still fits the same number
// of lines; 160-character details then fit within the 12 mm page margin.
const marginText = (value: string, limit: number) => {
  const characters = Array.from(value);
  if (characters.length <= limit) return value;
  const lines: string[] = [];
  let offset = 0;
  let linesLeft = Math.ceil(characters.length / limit);
  while (characters.length - offset > limit) {
    let end = offset + limit;
    const minimum = offset + Math.max(characters.length - offset - limit * (linesLeft - 1), Math.floor(limit * .6));
    for (let boundary = end; boundary >= minimum; boundary--) {
      if (/[\s/\\_.:,;\-]/u.test(characters[boundary - 1])) { end = boundary; break; }
    }
    lines.push(characters.slice(offset, end).join(''));
    offset = end;
    linesLeft--;
  }
  lines.push(characters.slice(offset).join(''));
  return lines.join('\n');
};

export function claimPrintPageRule({ reference, projectName, claimMonth, portrait = true }: { reference: string; projectName: string; claimMonth: string; portrait?: boolean }) {
  return `@page claim-pack {
    size: A4 ${portrait ? 'portrait' : 'landscape'};
    @top-left { content: ${cssString(marginText(projectName, 55))}; white-space: pre-line; }
    @top-right { content: ${cssString(claimMonth)}; }
    @bottom-left { content: ${cssString(marginText(`Claim ref: ${reference}`, 60))}; white-space: pre-line; }
  }`;
}
