/**
 * @file The lines every preview speaks and shows — voice tests, the speed
 * preview, the walkthrough-pace demo — in the narrator's language.
 *
 * WHY: a preview must match the real settings. A Hindi narrator demonstrated
 * with an English sentence feels broken, so each line is WRITTEN for each
 * language (not machine-translated), and the Hindi ones in the narrator's own
 * gender ("dikhata hoon" / "dikhati hoon").
 *
 *   NARRATION_LANGUAGES             English · Hinglish · हिंदी, and the voices that speak each
 *   demoLine('intro', 'hinglish', 'female')
 *   demoSteps('hindi', 'male')       three short captions for the mini walkthrough
 */

/** The languages a narrator can explain in. voiceLang = which AI voices speak it. */
export const NARRATION_LANGUAGES = [
  { id: 'en', label: 'English', voiceLang: 'en', hint: 'Natural English' },
  {
    id: 'hinglish',
    label: 'Hinglish',
    voiceLang: 'hi',
    hint: 'Hindi in Roman letters, everyday English words',
  },
  { id: 'hindi', label: 'हिंदी', voiceLang: 'hi', hint: 'Hindi in Hindi script' },
];

/** [male, female] — the same line when the verb doesn't change. */
const LINES = {
  intro: {
    en: ['Let me show you how to create your first walkthrough.'],
    hinglish: [
      'Chaliye, main aapko quickly dikhata hoon ki aap apna first walkthrough kaise bana sakte ho.',
      'Chaliye, main aapko quickly dikhati hoon ki aap apna first walkthrough kaise bana sakte ho.',
    ],
    hindi: [
      'चलिए, मैं आपको दिखाता हूँ कि आप अपना पहला वॉकथ्रू कैसे बना सकते हैं।',
      'चलिए, मैं आपको दिखाती हूँ कि आप अपना पहला वॉकथ्रू कैसे बना सकते हैं।',
    ],
  },
  speed: {
    en: ['This is how fast I will talk in your walkthroughs.'],
    hinglish: [
      'Aapke walkthrough mein main itni speed se bolunga.',
      'Aapke walkthrough mein main itni speed se bolungi.',
    ],
    hindi: [
      'आपके वॉकथ्रू में मैं इतनी रफ़्तार से बोलूँगा।',
      'आपके वॉकथ्रू में मैं इतनी रफ़्तार से बोलूँगी।',
    ],
  },
};

const STEPS = {
  en: [
    'Click New to start a walkthrough.',
    'Pick the screen you want to explain.',
    'Press Save. That’s it!',
  ],
  hinglish: [
    'New pe click karke walkthrough shuru kijiye.',
    'Jo screen samjhani hai, use chuniye.',
    'Save dabaiye, bas ho gaya!',
  ],
  hindi: [
    'वॉकथ्रू शुरू करने के लिए New पर क्लिक कीजिए।',
    'जो स्क्रीन समझानी है, उसे चुनिए।',
    'Save दबाइए, बस हो गया!',
  ],
};

const known = (language) => (language in STEPS ? language : 'en');

/**
 * @param {'intro' | 'speed'} key
 * @param {'en' | 'hinglish' | 'hindi'} language
 * @param {'male' | 'female' | null} [gender]
 */
export function demoLine(key, language, gender) {
  const forms = LINES[key][known(language)];
  return gender === 'female' && forms[1] ? forms[1] : forms[0];
}

/** Three captions for the mini walkthrough (the pace demo). */
export function demoSteps(language) {
  return STEPS[known(language)];
}

/**
 * The language a voice explains in: an English voice → English; a Hindi voice
 * keeps Hinglish or हिंदी (Hinglish when nothing was chosen).
 * @param {'en' | 'hi'} voiceLang
 * @param {string | null} [preferred]
 */
export function languageForVoice(voiceLang, preferred) {
  if (voiceLang !== 'hi') return 'en';
  return preferred === 'hindi' ? 'hindi' : 'hinglish';
}

/**
 * What a 'type' step says when its author wrote nothing: the typing, in the
 * narrator's language ("Yahan “12345” type kijiye."). Without it the step was
 * silent — only the value appeared in the field.
 * @param {string} value  the text typed in the walkthrough (may be empty)
 * @param {'en' | 'hinglish' | 'hindi'} language
 */
export function typeStepLine(value, language) {
  const v = value?.trim();
  if (language === 'hinglish') return v ? `Yahan “${v}” type kijiye.` : 'Yahan type kijiye.';
  if (language === 'hindi') return v ? `यहाँ “${v}” टाइप कीजिए।` : 'यहाँ टाइप कीजिए।';
  return v ? `Type “${v}” here.` : 'Type here.';
}
