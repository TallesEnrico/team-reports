/** Mensagem do problema, ou `null` se o e-mail tem um formato válido. */
export function validateInstitutionalEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email) return 'Informe seu e-mail.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail inválido.';
  return null;
}
