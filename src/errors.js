export class WordscanError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "WordscanError";
    this.code = code;
    this.details = options.details ?? {};
  }
}

export function asWordscanError(error, code, message, details = {}) {
  if (error instanceof WordscanError) {
    return error;
  }
  return new WordscanError(code, message, { cause: error, details });
}
