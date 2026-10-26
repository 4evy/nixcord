export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string | Error, ...args: unknown[]): void;
  success(message: string): void;
  debug(message: string): void;
}
