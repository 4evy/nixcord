const settings = {
  level1: {
    level2: {
      level3: {
        level4: {
          type: OptionType.STRING,
          description: '4 levels deep',
          default: 'deep-value',
        },
        level4b: {
          type: OptionType.NUMBER,
          description: 'Another 4 levels deep',
          default: 42,
        },
      },
      level3b: {
        type: OptionType.BOOLEAN,
        description: '3 levels deep',
        default: true,
      },
    },
  },
};
