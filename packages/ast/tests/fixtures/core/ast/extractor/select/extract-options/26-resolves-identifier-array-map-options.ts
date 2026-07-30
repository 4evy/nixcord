const mediaSizes = [16, 32, 48, 56, 64, 96, 128, 160, 256, 512, 1024];
const obj = {
  options: mediaSizes.map((size) => ({
    label: `${size}px`,
    value: size,
  })),
};
