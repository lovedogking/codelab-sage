export class CodelabSageError extends Error {
  public readonly code: string;

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CodelabSageError';
    this.code = code;
  }
}
