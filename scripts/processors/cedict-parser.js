/**
 * Parse CC-CEDICT format text file
 * Format: Traditional Simplified [pinyin] {jyutping} /def1/def2/
 */
export function parseCedictFormat(text) {
  const dict = {};
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.trim().length === 0) {
      continue;
    }
    
    // Try format with definitions: Traditional Simplified [pinyin] {jyutping} /def1/def2/
    let match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}\s+\/(.+)\/$/);
    if (match) {
      const [, traditional, simplified, pinyin, jyutping, definitions] = match;
      const defs = definitions.split('/').filter(d => d.trim().length > 0);
      
      const entry = {
        traditional,
        simplified,
        pinyin: pinyin || '',
        jyutping: jyutping || '',
        definitions: defs.filter(d => d && String(d).trim().length > 0)
      };
      
      // Store as arrays to support multiple pronunciations per word
      if (simplified) {
        if (!dict[simplified]) {
          dict[simplified] = [];
        }
        dict[simplified].push(entry);
      }
      if (traditional && traditional !== simplified) {
        if (!dict[traditional]) {
          dict[traditional] = [];
        }
        dict[traditional].push(entry);
      }
      continue;
    }
    
    // Try format without jyutping: Traditional Simplified [pinyin] /def1/def2/
    match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/);
    if (match) {
      const [, traditional, simplified, pinyin, definitions] = match;
      const defs = definitions.split('/').filter(d => d.trim().length > 0);
      
      const entry = {
        traditional,
        simplified,
        pinyin: pinyin || '',
        jyutping: '',
        definitions: defs.filter(d => d && String(d).trim().length > 0)
      };
      
      if (simplified) {
        if (!dict[simplified]) {
          dict[simplified] = [];
        }
        dict[simplified].push(entry);
      }
      if (traditional && traditional !== simplified) {
        if (!dict[traditional]) {
          dict[traditional] = [];
        }
        dict[traditional].push(entry);
      }
      continue;
    }
    
    // Try format with jyutping but no definitions: Traditional Simplified [pinyin] {jyutping}
    match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}$/);
    if (match) {
      const [, traditional, simplified, pinyin, jyutping] = match;
      
      const entry = {
        traditional,
        simplified,
        pinyin: pinyin || '',
        jyutping: jyutping || '',
        definitions: []
      };
      
      if (simplified) {
        if (!dict[simplified]) {
          dict[simplified] = [];
        }
        dict[simplified].push(entry);
      }
      if (traditional && traditional !== simplified) {
        if (!dict[traditional]) {
          dict[traditional] = [];
        }
        dict[traditional].push(entry);
      }
    }
  }
  
  return dict;
}
