import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

export default defineModifier({
  id: 'drain',
  name: '吸収',
  order: 2,
  summary: '与えたダメージの半分（切り捨て）だけ回復する',
  rate: BALANCE.modifiers.drain,
  textPrefix: '',
  textSuffix: '（与えたダメージの半分だけ回復）',
});
