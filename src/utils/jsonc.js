import fs from 'fs';

export function stripJsonComments(content) {
  let output = '';
  let inString = false;
  let quote = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];
    const prev = content[i - 1];

    if (inString) {
      output += char;
      if (char === quote && prev !== '\\') {
        inString = false;
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      output += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i++;
      continue;
    }

    output += char;
  }

  return output;
}

export function readJsonc(filePath) {
  return JSON.parse(stripJsonComments(fs.readFileSync(filePath, 'utf8')));
}
