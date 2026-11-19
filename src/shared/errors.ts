export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  code: string,
  message: string,
  status = 409,
  details?: unknown,
): asserts condition {
  if (!condition) throw new DomainError(code, message, status, details);
}
export function text(value: unknown, name: string, max = 200): string {
  ensure(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    'ValidationError',
    `${name} không hợp lệ.`,
    400,
  );
  return value.trim();
}
export function numeric(value: unknown, name: string, min: number, max: number): number {
  ensure(
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max,
    'ValidationError',
    `${name} phải từ ${min} đến ${max}.`,
    400,
  );
  return value;
}
export function must<T>(map: Map<string, T>, id: string, name = 'Dữ liệu'): T {
  const item = map.get(id);
  ensure(item, 'NotFound', `${name} không tồn tại.`, 404);
  return item;
}
