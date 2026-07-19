const formats = ['webp', 'png', 'jpg'] as const;
const obj = {
  options: formats.map((format) => ({
    label: format,
    value: format,
    default: format === 'png',
  })),
};
