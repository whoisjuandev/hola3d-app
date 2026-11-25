/** A model file that cannot be read. The message is Spanish and is shown to the owners as is. */
export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelError';
  }
}
