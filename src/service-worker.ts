import { register as registerPopupHandlers } from './popup/background-handler.js';
import { register as registerStatsHandlers } from './stats/background-handler.js';

registerPopupHandlers();
registerStatsHandlers();
