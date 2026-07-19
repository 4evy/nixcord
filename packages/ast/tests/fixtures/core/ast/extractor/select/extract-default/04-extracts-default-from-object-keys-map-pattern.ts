const Methods = { Random: 0, Constant: 1 };
const obj = {
  options: Object.keys(Methods).map((k, index) => ({
    label: k,
    value: (Methods as any)[k],
    default: index === 0,
  })),
};
