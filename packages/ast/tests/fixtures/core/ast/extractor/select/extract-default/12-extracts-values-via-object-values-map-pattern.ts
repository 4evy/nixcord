const PronounsFormat = {
  Lowercase: 'lowercase',
  Capitalized: 'capitalized',
} as const;
const obj = {
  options: Object.values(PronounsFormat).map((value) => ({
    value,
  })),
};
