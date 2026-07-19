const obj = {
  options: ['128', '256', '1024'].map((size) => ({
    label: size,
    value: size,
    default: size === '1024',
  })),
};
