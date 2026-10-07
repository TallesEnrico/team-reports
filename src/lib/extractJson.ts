/** Tira o JSON da resposta de um modelo: às vezes vem entre ``` ou com texto (e raciocínio) em volta. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const candidates = [cleaned];
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  // Deslizes comuns de modelo: vírgula antes de fechar e comentários de linha.
  const repaired = candidates.map((candidate) =>
    candidate.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'),
  );
  for (const candidate of [...candidates, ...repaired]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Tenta o próximo.
    }
  }
  throw new SyntaxError('A resposta não tem um JSON válido.');
}
