import { register as registerPopupHandlers } from './popup/background-handler.js';
import { register as registerStatsHandlers } from './stats/background-handler.js';
import { register as registerFlashcardHandlers } from './flashcards/background-handler.js';
import { register as registerOcrHandlers } from './ocr/background-handler.js';

registerPopupHandlers();
registerStatsHandlers();
registerFlashcardHandlers();
registerOcrHandlers();
