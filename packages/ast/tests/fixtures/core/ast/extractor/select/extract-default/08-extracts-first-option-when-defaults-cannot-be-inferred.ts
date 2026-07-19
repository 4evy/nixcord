const obj = {
  options: ['128', '256', '512', '1024', '2048'].map((size) => ({
    label: size,
    value: size,
    default: size === '1024',
  })),
};
