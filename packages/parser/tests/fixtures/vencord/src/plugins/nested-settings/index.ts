import definePlugin from '@utils/types';
import { settings } from './settings/store';

export default definePlugin({
  name: 'NestedSettings',
  description: 'Keeps its settings below a nested folder',
  settings,
});
