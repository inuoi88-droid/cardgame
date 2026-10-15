import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

export default defineModifier({
  id: 'pierce',
  name: '防御無視',
  order: 1,
  summary: 'このダメージが守備力とシールドを無視する',
  rate: BALANCE.modifiers.pierce,
  textPrefix: '防御無視の',
  textSuffix: '',
});
