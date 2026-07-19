function preferLarge(value: string) {
  return value.length > 4;
}
const obj = {
  options: ['Mini', 'Large'].map((mode) => ({
    value: mode,
    default: preferLarge(mode),
  })),
};
