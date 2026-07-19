import definePlugin from '@utils/types';
import settings from './settings';

export default definePlugin({
  name: 'MixedDiagnostics',
  description: 'Contains one serializable and one UI-only setting',
  settings,
});
