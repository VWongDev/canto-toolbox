# Canto Toolbox

A Chrome extension that displays Chinese word definitions in both Mandarin and Cantonese when you hover over Chinese characters on any webpage. Perfect for language learners and anyone reading Chinese text online.

> **Note**: This project is an experiment in using [Claude Code](https://docs.anthropic.com/en/docs/claude-code) as an AI-assisted development environment.

## Features

- **Hover Detection**: Automatically detects Chinese characters as you move your mouse over text, matching the longest word that covers the character you're on — hover the middle of 中國人 and you get 中國人, not 國人
- **Dual Language Support**: Shows definitions in both Mandarin (with Pinyin) and Cantonese (with Jyutping)
- **Hear It**: Tap the speaker on either reading to hear the word — Mandarin in a Mandarin voice, Cantonese in a Cantonese one. If your browser has no Cantonese voice the button stays hidden rather than reading it in Mandarin
- **Tone Colours**: Every syllable is coloured by tone, alongside the tone mark or digit
- **Both Scripts**: Shows the traditional/simplified counterpart when they differ
- **Works Everywhere**: Functions on any website with Chinese text
- **Word Statistics**: Tracks the words you actually stop to read — a word counts only once you pause on it — and remembers the sentence you met it in
- **Word Frequency**: Every definition shows how common the word is (Core 1000, Common, Frequent…) from the SUBTLEX-CH film-subtitle corpus, so you can tell what's worth learning first
- **Flashcard Review**: FSRS spaced repetition — each rating schedules when the word comes back, and the session shows what's due
- **Multi-word Selection**: Select multiple characters to look up phrases
- **Radical Breakdown**: Per-character etymology with radical, structure (IDS decomposition), and pictographic/ideographic/pictophonetic hints
- **Dark Mode Support**: Automatically adapts to your system theme
- **Offline Dictionary**: Uses local dictionary files - no API calls required
- **Fast Lookups**: Pre-processed dictionaries for instant results

## Screenshots

### Hover Popup
![Hover popup showing word definition](screenshots/hover-popup.png)

*Hover over Chinese text to see Mandarin and Cantonese definitions*

### Word Statistics
![Statistics page](screenshots/statistics.png)

*Track your most frequently looked-up words*

### Flashcard Review
![Flashcard review page](screenshots/flashcard-review.png)

*Review your looked-up words with spaced repetition*

### Dark Mode
![Dark mode support](screenshots/dark-mode.png)

*Automatically adapts to your system theme*

## Building and Installation

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0
- **Git** (for initializing dictionary submodules)

### Build Steps

1. **Clone the repository** (including submodules):
   ```bash
   git clone --recurse-submodules https://github.com/VWongDev/canto-toolbox.git
   cd canto-toolbox
   ```

   If you've already cloned without submodules:
   ```bash
   git submodule update --init --recursive
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Build the extension**:
   ```bash
   pnpm build
   ```

   This command will:
   - Pre-process dictionary files from the submodules
   - Build the extension using Vite
   - Output the extension to the `dist/` directory

4. **Load the extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top right)
   - Click "Load unpacked"
   - Select the `dist/` directory from this project

### Development

For development with hot reload, you can use:
```bash
pnpm preview
```

To clean build artifacts:
```bash
pnpm clean
```

To regenerate the screenshots used in the README and store listing (builds the extension, then launches Chrome to capture hover-popup, statistics, flashcard-review, and dark-mode screenshots):
```bash
pnpm screenshots
```
Screenshots are written to `screenshots/`. Chrome runs in headed mode because extensions are not supported in headless.

## Usage

1. **Hover over Chinese text**: Simply move your mouse over any Chinese characters on a webpage. A popup will appear showing:
   - The word in large text
   - Mandarin pronunciation (Pinyin) and definitions
   - Cantonese pronunciation (Jyutping) and definitions
   - Radical breakdown and etymology for each character (when available)

2. **Select multiple characters**: Click and drag to select multiple Chinese characters to look up phrases or compound words.

3. **View statistics**: Click the extension icon in the Chrome toolbar to see:
   - Your most frequently looked-up words
   - Hover counts for each word
   - Detailed definitions for each tracked word

4. **Flashcard review**: Once you've hovered over words at least twice, open the flashcard review page to quiz yourself — rate each card as Again, Hard, Good, or Easy. Ratings feed the [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) scheduler, so each word comes back when you're about to forget it rather than at random. When nothing is due, the page tells you when your next review lands.

## Dictionary Resources

This extension uses high-quality, open-source dictionary data:

### CC-CEDICT (Mandarin)
- **Source**: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict)
- **Repository**: [edvardsr/cc-cedict](https://github.com/edvardsr/cc-cedict)
- **License**: MIT License
- **Description**: A comprehensive Chinese-English dictionary with support for both simplified and traditional Chinese characters, including Pinyin pronunciations.

### CC-CANTO (Cantonese)
- **Source**: [CC-Canto](https://cc-canto.org/)
- **Repository**: [amadeusine/cc-canto-data](https://github.com/amadeusine/cc-canto-data)
- **License**: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)
- **Copyright**: CC-Canto and CC-CEDICT Cantonese readings are copyright (c) 2015-16 Pleco Software Incorporated
- **Description**: A comprehensive Cantonese-English dictionary with Jyutping pronunciations.

### Make Me a Hanzi (Etymology)
- **Source**: [Make Me a Hanzi](https://www.skishore.me/makemeahanzi)
- **Repository**: [skishore/makemeahanzi](https://github.com/skishore/makemeahanzi)
- **License**: See [COPYING](https://github.com/skishore/makemeahanzi/blob/master/COPYING) in the repository
- **Description**: Character etymology data (decomposition, radical, pictographic/pictophonetic hints) used in the extension’s etymology display.

### SUBTLEX-CH (Word Frequency)
- **Source**: Cai, Q., & Brysbaert, M. (2010). [SUBTLEX-CH: Chinese Word and Character Frequencies Based on Film Subtitles](https://doi.org/10.1371/journal.pone.0010729). *PLoS ONE*, 5(6), e10729.
- **Package**: [chinese-lexicon](https://github.com/peterolson/chinese-lexicon) (build-time only)
- **License**: ISC
- **Description**: Word frequency ranks from a film-subtitle corpus, used to band each word by how common it is. Only the 20,000 commonest words are shipped — past that the distinction stops being actionable.

## Inspiration

The hover detection mechanism in this extension is inspired by [Zhongwen](https://github.com/cschiller/zhongwen), a popular Chinese-English popup dictionary extension. This extension adapts and extends that approach to support both Mandarin and Cantonese dictionaries.

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

