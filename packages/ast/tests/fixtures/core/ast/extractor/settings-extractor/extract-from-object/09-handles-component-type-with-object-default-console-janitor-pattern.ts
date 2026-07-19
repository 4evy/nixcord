function defineDefault<T>(value: T): T {
  return value;
}
const settings = {
  allowLevel: {
    type: OptionType.COMPONENT,
    component: () => null,
    default: defineDefault({
      error: true,
      warn: false,
      trace: false,
      log: false,
      info: false,
      debug: false,
    }),
  },
};
