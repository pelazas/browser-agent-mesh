let counter = 0;
const prefix = Math.random().toString(36).substring(2, 8);

export function generateId(): string {
  counter++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${ts}-${rand}-${counter}`;
}
