const Methods = { Random: 0, Constant: 1 } as const;
const obj = {
  options: Object.keys(Methods).map((k: any) => ({ label: k, value: (Methods as any)[k] })),
};
