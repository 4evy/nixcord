import * as v from 'valibot';

export function parseOrThrow<T>(
  schema: v.GenericSchema<unknown, T>,
  data: unknown,
  ErrorClass: new (message: string) => Error,
  prefix?: string
): T {
  const result = v.safeParse(schema, data);
  if (result.success) return result.output;
  const validationMessage = v.summarize(result.issues);
  const message = prefix ? `${prefix}: ${validationMessage}` : validationMessage;
  throw new ErrorClass(message);
}
