const obj = {
  options: Object.values(buildEnum()).map((entry) => ({ value: entry })),
};
function buildEnum() {
  return { Primary: 'primary', Secondary: 'secondary' } as const;
}
