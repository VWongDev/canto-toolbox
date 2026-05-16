import { statsStorage } from './stats-storage.js';
import { registerHandlers } from '../shared/message-router.js';

export function register(): void {
  registerHandlers({
    get_statistics: async () => {
      const statistics = await statsStorage.getStatistics();
      return { success: true, type: 'get_statistics', statistics };
    },
  });
}
