const getDefaultVoice = () => ({ voiceURI: 'test-voice' });
const obj = {
  get default() {
    return getDefaultVoice()?.voiceURI;
  },
};
