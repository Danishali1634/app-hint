/**
 * @file Hinglish → Devanagari, so a HINDI voice can read step text written in
 * Roman script ("Yahan click karke aap data dekh sakte hain").
 *
 * WHY: Hindi voices (neuralVoice AI_VOICES with lang 'hi') pronounce
 * Devanagari. Roman letters reach them as English spelling ("hai" → "hi"), so
 * every Roman word is converted first. Devanagari passes through unchanged.
 *
 * HOW, per word (the approach of the open hinglish-tts project, without its
 * Python transliteration model):
 *   0. OVERRIDES: pronunciations fixed by hand in Settings → "Check my courses"
 *      always win.
 *   1. Known word lists, checked first:
 *        HINDI_WORDS    Roman Hindi ("kya" → क्या, "mai" → मैं)
 *        ENGLISH_WORDS  English as an Indian speaker says it ("click" → क्लिक)
 *        AMBIGUOUS      both ("to" = तो in Hindi, टू in English) — decided by
 *                       the sentence's language (step 0)
 *      HINGLISH_SPELLINGS  chat spellings read as the full word ("kre" → kare)
 *   2. ACRONYMS (PDF, ERP) are spelled letter by letter: पीडीएफ.
 *   2b. ENGLISH words the lists lack are said the English way from a
 *      pronunciation dictionary (englishDictionary.js): "barcode" → बारकोड, not
 *      Google's बरकड़े ("barkade"). A misspelling close to one English word is
 *      read as that word ("prablomatic" → problematic).
 *   3. LEARNED words: anything else is looked up ONCE with Google's
 *      transliteration service (the one behind Gboard Hindi typing — it
 *      understands chat spellings: "krti" → करती, "kese" → कैसे) and the answer
 *      is saved in this browser, so the next time it is instant and offline.
 *      Only toDevanagariAsync looks words up; toDevanagari uses what is saved.
 *   4. Offline / lookup off / no answer: rule-based transliteration (ROMAN RULES).
 *   Step 0: each sentence is judged Hindi or English by counting words from the
 *   two lists; it picks the AMBIGUOUS reading and the t/d sounds of unknown
 *   words (Hindi त/द, English ट/ड).
 *
 * PRIVACY: a lookup sends that ONE unfamiliar word (never the step text) to
 * inputtools.google.com — an unofficial, keyless endpoint, so it may change;
 * failures fall back to the rules. Settings can turn lookups off.
 *
 * A list entry always wins over a lookup. Idempotent: converting twice gives
 * the same text.
 */

import { LS_HINGLISH_OVERRIDES, LS_HINGLISH_WORDS } from '@/constants';
import {
  closestEnglishWord,
  englishToDevanagari,
  isEnglishWord,
  loadEnglishDictionary,
} from './englishDictionary';
import { EVERYDAY_WORDS, buildLexicon, closestHindi, indexBySound } from './hindiLexicon';

// ─── Word lists ──────────────────────────────────────────────────────────────

/** Roman-script Hindi. Keys are lowercase. */
const HINDI_WORDS = {
  // be / pronouns / postpositions
  hai: 'है',
  hain: 'हैं',
  ho: 'हो',
  hu: 'हूं',
  hoon: 'हूं',
  hun: 'हूं',
  tha: 'था',
  thi: 'थी',
  mai: 'मैं',
  m: 'मैं', // chat shorthand: "m krunga"
  mein: 'में',
  mera: 'मेरा',
  meri: 'मेरी',
  mere: 'मेरे',
  mujhe: 'मुझे',
  maine: 'मैंने',
  tera: 'तेरा',
  teri: 'तेरी',
  tere: 'तेरे',
  tu: 'तू',
  tum: 'तुम',
  tumhe: 'तुम्हें',
  tumhara: 'तुम्हारा',
  aap: 'आप',
  aapka: 'आपका',
  aapki: 'आपकी',
  aapke: 'आपके',
  aapko: 'आपको',
  aapne: 'आपने',
  hum: 'हम',
  humein: 'हमें',
  hamara: 'हमारा',
  humne: 'हमने',
  apna: 'अपना',
  apni: 'अपनी',
  apne: 'अपने',
  ye: 'ये',
  yeh: 'यह',
  wo: 'वो',
  woh: 'वह',
  isko: 'इसको',
  usko: 'उसको',
  iska: 'इसका',
  uska: 'उसका',
  iske: 'इसके',
  uske: 'उसके',
  iski: 'इसकी',
  uski: 'उसकी',
  isme: 'इसमें',
  usme: 'उसमें',
  usne: 'उसने',
  unka: 'उनका',
  unki: 'उनकी',
  unke: 'उनके',
  unhe: 'उन्हें',
  un: 'उन',
  ka: 'का',
  ki: 'की',
  ke: 'के',
  ko: 'को',
  se: 'से',
  pe: 'पे',
  aur: 'और',
  ya: 'या',
  bhi: 'भी',
  toh: 'तो',
  na: 'ना',
  nahi: 'नहीं',
  nahin: 'नहीं',
  haan: 'हां',
  han: 'हां',
  ji: 'जी',
  // questions / connectors
  kya: 'क्या',
  kyun: 'क्यों',
  kyon: 'क्यों',
  kyunki: 'क्योंकि',
  kaise: 'कैसे',
  kaisa: 'कैसा',
  kab: 'कब',
  kahan: 'कहां',
  kahaan: 'कहां',
  kaun: 'कौन',
  kitna: 'कितना',
  kitni: 'कितनी',
  kitne: 'कितने',
  jab: 'जब',
  tab: 'तब',
  agar: 'अगर',
  lekin: 'लेकिन',
  magar: 'मगर',
  isliye: 'इसलिए',
  matlab: 'मतलब',
  phir: 'फिर',
  fir: 'फिर',
  // place / time / amount
  yahan: 'यहां',
  yahaan: 'यहां',
  yaha: 'यहां',
  wahan: 'वहां',
  waha: 'वहां',
  yahi: 'यही',
  wahi: 'वही',
  upar: 'ऊपर',
  neeche: 'नीचे',
  niche: 'नीचे',
  aage: 'आगे',
  peeche: 'पीछे',
  andar: 'अंदर',
  baayein: 'बाएं',
  daayein: 'दाएं',
  saath: 'साथ',
  sath: 'साथ',
  liye: 'लिए',
  abhi: 'अभी',
  aaj: 'आज',
  kal: 'कल',
  pehle: 'पहले',
  pahle: 'पहले',
  baad: 'बाद',
  jaldi: 'जल्दी',
  ek: 'एक',
  teen: 'तीन',
  sab: 'सब',
  sabhi: 'सभी',
  kuch: 'कुछ',
  kuchh: 'कुछ',
  sirf: 'सिर्फ़',
  bahut: 'बहुत',
  bohot: 'बहुत',
  bahot: 'बहुत',
  bas: 'बस',
  ab: 'अब',
  tak: 'तक',
  jo: 'जो',
  koi: 'कोई',
  mat: 'मत',
  baar: 'बार',
  pata: 'पता',
  kaha: 'कहा',
  kahin: 'कहीं',
  baat: 'बात',
  wapas: 'वापस',
  aisa: 'ऐसा',
  jaise: 'जैसे',
  waise: 'वैसे',
  ise: 'इसे',
  pura: 'पूरा',
  poora: 'पूरा',
  pehla: 'पहला',
  dusra: 'दूसरा',
  teesra: 'तीसरा',
  aakhri: 'आखिरी',
  // verbs
  kar: 'कर',
  karo: 'करो',
  karna: 'करना',
  karne: 'करने',
  karke: 'करके',
  karein: 'करें',
  kare: 'करे',
  kijiye: 'कीजिए',
  kijie: 'कीजिए',
  dekho: 'देखो',
  dekh: 'देख',
  dekhein: 'देखें',
  dekhna: 'देखना',
  dekhiye: 'देखिए',
  sakte: 'सकते',
  sakta: 'सकता',
  sakti: 'सकती',
  sakein: 'सकें',
  raha: 'रहा',
  rahi: 'रही',
  rahe: 'रहे',
  jaana: 'जाना',
  jana: 'जाना',
  jaaye: 'जाए',
  jaye: 'जाए',
  jayega: 'जाएगा',
  jaayega: 'जाएगा',
  jao: 'जाओ',
  jaiye: 'जाइए',
  aa: 'आ',
  aao: 'आओ',
  aaiye: 'आइए',
  aayega: 'आएगा',
  hoga: 'होगा',
  hogi: 'होगी',
  honge: 'होंगे',
  hota: 'होता',
  hoti: 'होती',
  hote: 'होते',
  gaya: 'गया',
  gayi: 'गई',
  gaye: 'गए',
  liya: 'लिया',
  diya: 'दिया',
  dena: 'देना',
  lena: 'लेना',
  chahiye: 'चाहिए',
  padega: 'पड़ेगा',
  milega: 'मिलेगा',
  milta: 'मिलता',
  dikhega: 'दिखेगा',
  dikhta: 'दिखता',
  dikhai: 'दिखाई',
  batao: 'बताओ',
  bataiye: 'बताइए',
  samjho: 'समझो',
  samajh: 'समझ',
  chalo: 'चलो',
  chaliye: 'चलिए',
  kholo: 'खोलो',
  kholiye: 'खोलिए',
  khulega: 'खुलेगा',
  chuno: 'चुनो',
  chuniye: 'चुनिए',
  likho: 'लिखो',
  likhiye: 'लिखिए',
  bharo: 'भरो',
  bhariye: 'भरिए',
  dabao: 'दबाओ',
  dabaiye: 'दबाइए',
  shuru: 'शुरू',
  khatam: 'खत्म',
  karte: 'करते',
  karta: 'करता',
  karti: 'करती',
  karen: 'करें', // also an English name: the dictionary must not read it as "Karen"
  karenge: 'करेंगे',
  karunga: 'करूंगा',
  karungi: 'करूंगी',
  kiya: 'किया',
  dalo: 'डालो',
  daalo: 'डालो',
  dalna: 'डालना',
  daalna: 'डालना',
  dalein: 'डालें',
  daalein: 'डालें',
  lagao: 'लगाओ',
  lagaiye: 'लगाइए',
  lagana: 'लगाना',
  lage: 'लगे',
  lagega: 'लगेगा',
  bhej: 'भेज',
  bhejo: 'भेजो',
  bhejiye: 'भेजिए',
  bhejna: 'भेजना',
  rakho: 'रखो',
  rakhe: 'रखे',
  rakhiye: 'रखिए',
  rakhna: 'रखना',
  hatao: 'हटाओ',
  hataiye: 'हटाइए',
  nikalo: 'निकालो',
  nikaliye: 'निकालिए',
  milao: 'मिलाओ',
  jodo: 'जोड़ो',
  jodiye: 'जोड़िए',
  banao: 'बनाओ',
  banaiye: 'बनाइए',
  chalao: 'चलाओ',
  chalaiye: 'चलाइए',
  dekhe: 'देखे',
  lo: 'लो',
  de: 'दे',
  le: 'ले',
  // adjectives / nouns / greetings
  wala: 'वाला',
  wali: 'वाली',
  wale: 'वाले',
  accha: 'अच्छा',
  acha: 'अच्छा',
  achha: 'अच्छा',
  theek: 'ठीक',
  thik: 'ठीक',
  sahi: 'सही',
  galat: 'गलत',
  zaroor: 'ज़रूर',
  zaroori: 'ज़रूरी',
  naya: 'नया',
  nayi: 'नई',
  naye: 'नए',
  purana: 'पुराना',
  naam: 'नाम',
  kaam: 'काम',
  ghar: 'घर',
  paisa: 'पैसा',
  paise: 'पैसे',
  jaankari: 'जानकारी',
  jankari: 'जानकारी',
  samay: 'समय',
  din: 'दिन',
  raat: 'रात',
  yaar: 'यार',
  bhai: 'भाई',
  namaste: 'नमस्ते',
  namaskar: 'नमस्कार',
  dhanyavaad: 'धन्यवाद',
  dhanyawad: 'धन्यवाद',
  shukriya: 'शुक्रिया',
};

/** English words, as an Indian speaker says them. Keys are lowercase. */
const ENGLISH_WORDS = {
  // grammar words (also the English signal in sentenceLanguage)
  a: 'अ',
  an: 'ऐन',
  and: 'ऐंड',
  of: 'ऑफ़',
  on: 'ऑन',
  at: 'ऐट',
  for: 'फ़ॉर',
  from: 'फ़्रॉम',
  with: 'विद',
  by: 'बाय',
  this: 'दिस',
  that: 'दैट',
  these: 'दीज़',
  those: 'दोज़',
  it: 'इट',
  its: 'इट्स',
  are: 'आर',
  was: 'वॉज़',
  were: 'वर',
  be: 'बी',
  been: 'बीन',
  will: 'विल',
  can: 'कैन',
  could: 'कुड',
  should: 'शुड',
  would: 'वुड',
  have: 'हैव',
  has: 'हैज़',
  had: 'हैड',
  not: 'नॉट',
  no: 'नो',
  yes: 'यस',
  you: 'यू',
  your: 'योर',
  we: 'वी',
  our: 'आवर',
  they: 'दे',
  their: 'देयर',
  he: 'ही',
  she: 'शी',
  my: 'माय',
  how: 'हाउ',
  what: 'व्हाट',
  when: 'वेन',
  where: 'वेयर',
  why: 'वाय',
  which: 'विच',
  who: 'हू',
  here: 'हियर',
  there: 'देयर',
  now: 'नाउ',
  then: 'देन',
  than: 'दैन',
  all: 'ऑल',
  more: 'मोर',
  about: 'अबाउट',
  into: 'इनटू',
  out: 'आउट',
  up: 'अप',
  down: 'डाउन',
  just: 'जस्ट',
  also: 'ऑलसो',
  only: 'ओनली',
  so: 'सो',
  if: 'इफ़',
  dont: 'डोंट',
  lets: 'लेट्स',
  i: 'आई',
  love: 'लव',
  like: 'लाइक',
  friend: 'फ़्रेंड',
  week: 'वीक',
  visiting: 'विज़िटिंग',
  make: 'मेक',
  take: 'टेक',
  time: 'टाइम',
  home: 'होम',
  first: 'फ़र्स्ट',
  but: 'बट',
  get: 'गेट',
  set: 'सेट',
  put: 'पुट',
  cut: 'कट',
  let: 'लेट',
  yet: 'येट',
  any: 'एनी',
  way: 'वे',
  day: 'डे',
  same: 'सेम',
  late: 'लेट',
  // actions
  use: 'यूज़',
  using: 'यूज़िंग',
  open: 'ओपन',
  close: 'क्लोज़',
  click: 'क्लिक',
  press: 'प्रेस',
  tap: 'टैप',
  type: 'टाइप',
  enter: 'एंटर',
  choose: 'चूज़',
  select: 'सिलेक्ट', // Indian English: "si-lect", not "say-lect"
  see: 'सी',
  view: 'व्यू',
  show: 'शो',
  find: 'फ़ाइंड',
  go: 'गो',
  start: 'स्टार्ट',
  stop: 'स्टॉप',
  save: 'सेव',
  submit: 'सबमिट',
  search: 'सर्च',
  upload: 'अपलोड',
  download: 'डाउनलोड',
  update: 'अपडेट',
  delete: 'डिलीट',
  edit: 'एडिट',
  add: 'ऐड',
  print: 'प्रिंट',
  export: 'एक्सपोर्ट',
  import: 'इंपोर्ट',
  check: 'चेक',
  finish: 'फ़िनिश',
  done: 'डन',
  confirm: 'कन्फ़र्म',
  cancel: 'कैंसल',
  try: 'ट्राई',
  wait: 'वेट',
  reply: 'रिप्लाई',
  review: 'रिव्यू',
  deliver: 'डिलीवर',
  // product / UI words
  step: 'स्टेप',
  steps: 'स्टेप्स',
  walkthrough: 'वॉकथ्रू',
  sound: 'साउंड',
  video: 'वीडियो',
  voice: 'वॉइस',
  welcome: 'वेलकम',
  hello: 'हेलो',
  thanks: 'थैंक्स',
  thank: 'थैंक',
  please: 'प्लीज़',
  button: 'बटन',
  page: 'पेज',
  screen: 'स्क्रीन',
  data: 'डेटा',
  graph: 'ग्राफ़',
  chart: 'चार्ट',
  option: 'ऑप्शन',
  options: 'ऑप्शंस',
  menu: 'मेन्यू',
  login: 'लॉगिन',
  logout: 'लॉगआउट',
  setting: 'सेटिंग',
  settings: 'सेटिंग्स',
  report: 'रिपोर्ट',
  form: 'फ़ॉर्म',
  field: 'फ़ील्ड',
  user: 'यूज़र',
  account: 'अकाउंट',
  dashboard: 'डैशबोर्ड',
  link: 'लिंक',
  email: 'ईमेल',
  password: 'पासवर्ड',
  order: 'ऑर्डर',
  invoice: 'इनवॉइस',
  customer: 'कस्टमर',
  product: 'प्रोडक्ट',
  return: 'रिटर्न',
  stock: 'स्टॉक',
  warehouse: 'वेयरहाउस',
  entry: 'एंट्री',
  list: 'लिस्ट',
  filter: 'फ़िल्टर',
  date: 'डेट',
  status: 'स्टेटस',
  next: 'नेक्स्ट',
  back: 'बैक',
  ok: 'ओके',
  okay: 'ओके',
  total: 'टोटल',
  amount: 'अमाउंट',
  payment: 'पेमेंट',
  detail: 'डिटेल',
  details: 'डिटेल्स',
  name: 'नेम',
  number: 'नंबर',
  phone: 'फ़ोन',
  mobile: 'मोबाइल',
  app: 'ऐप',
  website: 'वेबसाइट',
  online: 'ऑनलाइन',
  team: 'टीम',
  sales: 'सेल्स',
  price: 'प्राइस',
  quantity: 'क्वांटिटी',
  item: 'आइटम',
  items: 'आइटम्स',
  box: 'बॉक्स',
  icon: 'आइकन',
  window: 'विंडो',
  popup: 'पॉपअप',
  top: 'टॉप',
  bottom: 'बॉटम',
  left: 'लेफ़्ट',
  right: 'राइट',
  side: 'साइड',
  checkbox: 'चेकबॉक्स',
  error: 'एरर',
  system: 'सिस्टम',
  software: 'सॉफ़्टवेयर',
  process: 'प्रोसेस',
  feature: 'फ़ीचर',
  repack: 'रीपैक',
  // warehouse / footwear / billing words
  barcode: 'बारकोड',
  scan: 'स्कैन',
  scanner: 'स्कैनर',
  qr: 'क्यूआर',
  id: 'आईडी',
  sku: 'एसकेयू',
  gst: 'जीएसटी',
  challan: 'चालान',
  pincode: 'पिनकोड',
  dispatch: 'डिस्पैच',
  inventory: 'इन्वेंटरी',
  courier: 'कूरियर',
  tally: 'टैली',
  size: 'साइज़',
  color: 'कलर',
  colour: 'कलर',
  article: 'आर्टिकल',
  footwear: 'फ़ुटवियर',
  shoe: 'शू',
  shoes: 'शूज़',
  pair: 'पेयर',
  packing: 'पैकिंग',
  label: 'लेबल',
  sticker: 'स्टिकर',
  bill: 'बिल',
  receipt: 'रिसीट',
  vendor: 'वेंडर',
  purchase: 'परचेज़',
  transfer: 'ट्रांसफ़र',
  location: 'लोकेशन',
  rack: 'रैक',
  carton: 'कार्टन',
  tab: 'टैब',
  row: 'रो',
  column: 'कॉलम',
  sheet: 'शीट',
  excel: 'एक्सेल',
  dropdown: 'ड्रॉपडाउन',
  code: 'कोड',
  media: 'मीडिया',
  // English loans common in Hinglish (from the hinglish-tts word list)
  biryani: 'बिरयानी',
  boss: 'बॉस',
  butter: 'बटर',
  chicken: 'चिकन',
  deadline: 'डेडलाइन',
  event: 'इवेंट',
  file: 'फ़ाइल',
  homework: 'होमवर्क',
  issue: 'इश्यू',
  laptop: 'लैपटॉप',
  leave: 'लीव',
  log: 'लॉग',
  lucky: 'लकी',
  lunch: 'लंच',
  message: 'मैसेज',
  movie: 'मूवी',
  nervous: 'नर्वस',
  new: 'न्यू',
  office: 'ऑफ़िस',
  party: 'पार्टी',
  personal: 'पर्सनल',
  place: 'प्लेस',
  presentation: 'प्रेज़ेंटेशन',
  quickly: 'क्विकली',
  restaurant: 'रेस्टोरेंट',
  ticket: 'टिकट',
  tomorrow: 'टुमॉरो',
  waste: 'वेस्ट',
  meeting: 'मीटिंग',
  school: 'स्कूल',
  // Indian names (hinglish-tts list)
  aishwarya: 'ऐश्वर्या',
  arjun: 'अर्जुन',
  bengaluru: 'बेंगलुरु',
  chennai: 'चेन्नई',
  delhi: 'दिल्ली',
  hyderabad: 'हैदराबाद',
  mumbai: 'मुंबई',
  pune: 'पुणे',
  priya: 'प्रिया',
  rohan: 'रोहन',
  tata: 'टाटा',
  mr: 'मिस्टर',
  karim: 'करीम',
  old: 'ओल्ड',
  khanna: 'खन्ना',
  connaught: 'कनॉट',
  consultancy: 'कंसल्टेंसी',
  services: 'सर्विसेज़',
  paradise: 'पैराडाइज़',
};

/** Words that are both Hindi and English: [Hindi reading, English reading]. */
const AMBIGUOUS = {
  or: ['और', 'ऑर'],
  to: ['तो', 'टू'],
  me: ['में', 'मी'],
  main: ['मैं', 'मेन'],
  do: ['दो', 'डू'],
  is: ['इस', 'इज़'],
  us: ['उस', 'अस'],
  the: ['थे', 'द'],
  par: ['पर', 'पार'],
  hi: ['ही', 'हाय'],
  in: ['इन', 'इन'],
  band: ['बंद', 'बैंड'],
  sake: ['सकें', 'सेक'],
  mile: ['मिले', 'माइल'],
};

/**
 * Chat spellings → the full Hinglish (or English) word. Read as that word, and
 * "Fix spelling" writes it out. "h" only counts in a Hindi sentence.
 */
export const HINGLISH_SPELLINGS = {
  h: 'hai',
  k: 'ke',
  hn: 'hain',
  kr: 'kar',
  kre: 'kare',
  kren: 'karein',
  krein: 'karein',
  krna: 'karna',
  krne: 'karne',
  kro: 'karo',
  krke: 'karke',
  krte: 'karte',
  krta: 'karta',
  krti: 'karti',
  krenge: 'karenge',
  krunga: 'karunga',
  krungi: 'karungi',
  kia: 'kiya',
  nhi: 'nahi',
  ky: 'kya',
  kyu: 'kyun',
  kese: 'kaise',
  jese: 'jaise',
  wese: 'waise',
  esa: 'aisa',
  aesa: 'aisa',
  ap: 'aap',
  apko: 'aapko',
  apka: 'aapka',
  apke: 'aapke',
  apki: 'aapki',
  yha: 'yahan',
  yaha: 'yahan',
  waha: 'wahan',
  vaha: 'wahan',
  vahan: 'wahan',
  bhot: 'bahut',
  bht: 'bahut',
  mt: 'mat',
  skte: 'sakte',
  skta: 'sakta',
  skti: 'sakti',
  rha: 'raha',
  rhi: 'rahi',
  rhe: 'rahe',
  gya: 'gaya',
  gyi: 'gayi',
  gye: 'gaye',
  sb: 'sab',
  kch: 'kuch',
  abi: 'abhi',
  phr: 'phir',
  bs: 'bas',
  tk: 'tak',
  jb: 'jab',
  tb: 'tab',
  hme: 'humein',
  hume: 'humein',
  dkho: 'dekho',
  plz: 'please',
  pls: 'please',
  thx: 'thanks',
  thnx: 'thanks',
  msg: 'message',
};

/** Grammar words that mark a sentence as English (loanwords like "click" don't). */
const ENGLISH_GRAMMAR = new Set(
  'a an and or of on at for from with by this that these those it its are was were be been will can could should would have has had not you your we our they their he she my i how what when where why which who here there now then than all about into just also only if dont lets'.split(
    ' ',
  ),
);

// ─── Acronyms ────────────────────────────────────────────────────────────────

const LETTER_NAMES = {
  a: 'ए',
  b: 'बी',
  c: 'सी',
  d: 'डी',
  e: 'ई',
  f: 'एफ़',
  g: 'जी',
  h: 'एच',
  i: 'आई',
  j: 'जे',
  k: 'के',
  l: 'एल',
  m: 'एम',
  n: 'एन',
  o: 'ओ',
  p: 'पी',
  q: 'क्यू',
  r: 'आर',
  s: 'एस',
  t: 'टी',
  u: 'यू',
  v: 'वी',
  w: 'डब्ल्यू',
  x: 'एक्स',
  y: 'वाई',
  z: 'ज़ेड',
};

const isAcronym = (word) => word.length >= 2 && word.length <= 5 && word === word.toUpperCase();
const spellOut = (word) => [...word.toLowerCase()].map((c) => LETTER_NAMES[c]).join('');

// ─── ROMAN RULES (unknown words) ─────────────────────────────────────────────
// Longest match first. Vowels: [letter at the start of a syllable, sign after a
// consonant]. Consonants: [Hindi sentence, English sentence] — they differ only
// for t/d (dental त द in Hindi, retroflex ट ड in English).

const VOWELS = [
  ['aa', 'आ', 'ा'],
  ['ai', 'ऐ', 'ै'],
  ['au', 'औ', 'ौ'],
  ['ee', 'ई', 'ी'],
  ['ii', 'ई', 'ी'],
  ['oo', 'ऊ', 'ू'],
  ['uu', 'ऊ', 'ू'],
  ['ei', 'ए', 'े'],
  ['a', 'अ', ''],
  ['i', 'इ', 'ि'],
  ['u', 'उ', 'ु'],
  ['e', 'ए', 'े'],
  ['o', 'ओ', 'ो'],
];

const CONSONANTS = [
  ['cch', 'च्छ', 'च्छ'],
  ['chh', 'छ', 'छ'],
  ['kh', 'ख', 'ख'],
  ['gh', 'घ', 'घ'],
  ['ch', 'च', 'च'],
  ['jh', 'झ', 'झ'],
  ['th', 'थ', 'थ'],
  ['dh', 'ध', 'ध'],
  ['ph', 'फ', 'फ'],
  ['bh', 'भ', 'भ'],
  ['sh', 'श', 'श'],
  ['ck', 'क', 'क'],
  ['k', 'क', 'क'],
  ['g', 'ग', 'ग'],
  ['j', 'ज', 'ज'],
  ['t', 'त', 'ट'],
  ['d', 'द', 'ड'],
  ['n', 'न', 'न'],
  ['p', 'प', 'प'],
  ['b', 'ब', 'ब'],
  ['m', 'म', 'म'],
  ['y', 'य', 'य'],
  ['r', 'र', 'र'],
  ['l', 'ल', 'ल'],
  ['v', 'व', 'व'],
  ['w', 'व', 'व'],
  ['s', 'स', 'स'],
  ['h', 'ह', 'ह'],
  ['f', 'फ़', 'फ़'],
  ['z', 'ज़', 'ज़'],
  ['q', 'क', 'क'],
  ['x', 'क्स', 'क्स'],
  ['c', 'क', 'क'],
];

const HALANT = '्';
const ANUSVARA = 'ं';
/** Vowel signs after which a word-final "n" is nasal: "hain" → हैं, "yahan" → यहां. */
const LONG_SIGNS = new Set(['ा', 'ै', 'ी', 'ू', 'े', 'ो', 'ौ']);

const matchAt = (table, word, i) => table.find(([roman]) => word.startsWith(roman, i));

/**
 * Best-guess spelling of an unknown Roman word.
 * @param {string} word lowercase a–z
 * @param {'hi' | 'en'} lang
 * @param {boolean} [silentE]  English final "e" is silent ("love" → लव)
 */
function transliterate(word, lang, silentE = true) {
  let out = '';
  let afterConsonant = false;
  let i = 0;
  while (i < word.length) {
    const vowel = matchAt(VOWELS, word, i);
    if (vowel) {
      const [roman, letter, sign] = vowel;
      const last = i + roman.length === word.length;
      if (afterConsonant) {
        // Final "a"/"i" are long in Hinglish spelling: "raha" → रहा, "meri" → मेरी.
        // English silent final e: "love" → लव, not लवे.
        if (last && roman === 'e' && lang === 'en' && silentE && word.length > 3) out += '';
        else if (last && roman === 'a' && word.length > 2) out += 'ा';
        else if (last && roman === 'i') out += 'ी';
        else out += sign;
      } else {
        out += letter;
      }
      afterConsonant = false;
      i += roman.length;
      continue;
    }
    const consonant = matchAt(CONSONANTS, word, i);
    if (!consonant) {
      i += 1;
      continue;
    }
    const [roman, hindi, english] = consonant;
    const next = i + roman.length;
    const atEnd = next === word.length;
    const beforeConsonant = !atEnd && !matchAt(VOWELS, word, next);
    // Nasal n/m: before another consonant ("hindi" → हिंदी), or word-final after a long vowel.
    if (
      roman === 'n' &&
      !afterConsonant &&
      out &&
      (beforeConsonant || (atEnd && LONG_SIGNS.has(out.at(-1))))
    ) {
      out += ANUSVARA;
      i = next;
      continue;
    }
    if (afterConsonant) out += HALANT;
    out += lang === 'en' ? english : hindi;
    afterConsonant = true;
    i = next;
  }
  return out;
}

// ─── Sentences and words ─────────────────────────────────────────────────────

const TOKEN = /[A-Za-z]+|[ऀ-ॿ]+|\d+|\s+|./g;
/** Splits after each sentence end, keeping every character. */
const SENTENCE_END = /(?<=[.!?।\n])/;
const isRoman = (token) => /^[A-Za-z]+$/.test(token);
const isDevanagari = (token) => /[ऀ-ॿ]/.test(token);

/**
 * 'hi' unless the sentence leans English: grammar words count 1, other English
 * words half (loanwords like "click" also appear in Hinglish).
 */
function sentenceLanguage(tokens) {
  let hindi = 0;
  let english = 0;
  for (const token of tokens) {
    if (isDevanagari(token)) hindi += 1;
    if (!isRoman(token)) continue;
    const key = token.toLowerCase();
    if (key in HINDI_WORDS || key in HINGLISH_SPELLINGS || LEXICON.has(key)) hindi += 1;
    else if (ENGLISH_GRAMMAR.has(key)) english += 1;
    else if (key in ENGLISH_WORDS || key in AMBIGUOUS || isEnglishWord(key)) english += 0.5;
  }
  return english > hindi ? 'en' : 'hi';
}

/**
 * How one Roman word is read, and why (Settings → "Check my courses" shows the
 * why). Sources, in the order they are tried:
 *   override  fixed by hand        hindi / english / ambiguous  the word lists
 *   acronym   PDF → पीडीएफ          spelling   "kre" → kare
 *   dictionary  English word        corrected  close to one English word
 *   learned   looked up online      rules      best guess
 * @param {string} token Roman letters
 * @param {'hi' | 'en'} lang the sentence's language
 * @returns {{ text: string, source: string, meant?: string }}
 */
function explainWord(token, lang) {
  const key = token.toLowerCase();
  if (overrides.has(key)) return { text: overrides.get(key), source: 'override' };
  if (isAcronym(token) && !(key in ENGLISH_WORDS))
    return { text: spellOut(token), source: 'acronym' };
  if (key in AMBIGUOUS) return { text: AMBIGUOUS[key][lang === 'en' ? 1 : 0], source: 'ambiguous' };
  if (lang === 'hi' && key in HINDI_WORDS) return { text: HINDI_WORDS[key], source: 'hindi' };
  if (key in ENGLISH_WORDS) return { text: ENGLISH_WORDS[key], source: 'english' };
  if (key in HINDI_WORDS) return { text: HINDI_WORDS[key], source: 'hindi' };
  const full = spellingOf(key, lang);
  if (full) return { ...explainWord(full, lang), source: 'spelling', meant: full };
  // Plural or possessive of a known word: "buttons", "Karim's" (apostrophe already joined).
  const base = key.endsWith('s') ? key.slice(0, -1) : '';
  // After a consonant the s joins it: "users" यूज़र्स, "steps" स्टेप्स; "menus" मेन्यूस.
  if (base in ENGLISH_WORDS) {
    const word = ENGLISH_WORDS[base];
    const joined = /(?:[\u0915-\u0939\u0958-\u095F]|\u093C)$/.test(word) ? `${word}्स` : `${word}स`;
    return { text: joined, source: 'english' };
  }
  // Generated Hindi forms ("dikhaiye"), unless it is also an English word ("late").
  if (LEXICON.has(key) && !isEnglishWord(key)) return { text: LEXICON.get(key), source: 'hindi' };
  const english = englishToDevanagari(key);
  if (english) return { text: english, source: 'dictionary' };
  // Loosely typed Hinglish: "dikai" → dikhai, "hmri" → hamari.
  const hindi = closestHindiWord(key);
  if (hindi) return { ...explainWord(hindi, 'hi'), source: 'spelling', meant: hindi };
  const meant = closestEnglishWord(key);
  if (meant) return { ...explainWord(meant, 'en'), source: 'corrected', meant };
  if (learned.has(key)) return { text: learned.get(key), source: 'learned' };
  return { text: transliterate(key, lang), source: 'rules' };
}

/** Generated Hindi word forms (hindiLexicon). */
const LEXICON = buildLexicon();
// Everyday words ("taki", "hamari") are full list words: they beat the English dictionary.
for (const [roman, dev] of Object.entries(EVERYDAY_WORDS)) HINDI_WORDS[roman] ??= dev;
let soundIndex = null;

/**
 * The Hindi word a loose spelling means ("dikai" → "dikhai", "hmri" → "hamari"),
 * or null. Never for an English word.
 * @param {string} key lowercase
 */
export function closestHindiWord(key) {
  if (key in HINDI_WORDS || LEXICON.has(key) || isEnglishWord(key)) return null;
  soundIndex ??= indexBySound([...Object.entries(HINDI_WORDS), ...LEXICON]);
  return closestHindi(key, soundIndex);
}

/**
 * Google's reading of a loosely typed word, written back in Hinglish — only
 * when that is a known Hindi word ("kese" → कैसे → "kaise"), else null.
 * Uses saved lookups: call lookUpUnknownWords first.
 * @param {string} key lowercase
 */
export function onlineHindiWord(key) {
  const dev = learned.get(key);
  if (!dev || isEnglishWord(key)) return null;
  if (!romanOf) buildRomanOf();
  const roman = romanOf.get(dev);
  return roman && roman !== key && (roman in HINDI_WORDS || LEXICON.has(roman)) ? roman : null;
}

/** Looks up (once, saved) every word of `text` the lists and rules don't know. */
export async function lookUpUnknownWords(text) {
  await loadEnglishDictionary();
  await lookUpWords(unknownWords(text || ''));
  romanOf = null; // new words may be known now
}

/** The full word for a chat spelling ("kre" → "kare"), or null. */
function spellingOf(key, lang) {
  const full = HINGLISH_SPELLINGS[key];
  if (!full || ((key === 'h' || key === 'k') && lang !== 'hi')) return null;
  return full;
}

function convertWord(token, lang) {
  return explainWord(token, lang).text;
}

/**
 * The language a whole text is written in: 'hi' for Hinglish or Hindi script,
 * 'en' for English (scored like sentenceLanguage, over every word). Better once
 * the English dictionary is loaded (translate.textLanguage loads it).
 * @param {string} text
 * @returns {'en' | 'hi'}
 */
export function textLanguageOf(text) {
  const tokens = (text || '').match(TOKEN) || [];
  if (tokens.some(isDevanagari)) return 'hi';
  return sentenceLanguage(tokens);
}

/** True if a word list or a hand fix has this word (lowercase): it is spelled right. */
export function isKnownWord(key) {
  return (
    overrides.has(key) ||
    key in HINDI_WORDS ||
    key in ENGLISH_WORDS ||
    key in AMBIGUOUS ||
    LEXICON.has(key)
  );
}

/** True if the lists, a hand fix or the dictionary already know this word (no lookup needed). */
function isListed(token) {
  const key = token.toLowerCase();
  if (isAcronym(token) && !(key in ENGLISH_WORDS)) return true;
  const base = key.endsWith('s') ? key.slice(0, -1) : '';
  return (
    overrides.has(key) ||
    key in AMBIGUOUS ||
    key in HINDI_WORDS ||
    key in ENGLISH_WORDS ||
    key in HINGLISH_SPELLINGS ||
    LEXICON.has(key) ||
    !!closestHindiWord(key) ||
    base in ENGLISH_WORDS ||
    !!englishToDevanagari(key) ||
    !!closestEnglishWord(key)
  );
}

/**
 * Converts Hinglish (any mix of Roman and Devanagari) to Devanagari for a Hindi
 * voice. Punctuation, digits and Devanagari stay as they are.
 * @param {string} text
 * @returns {string}
 */
export function toDevanagari(text) {
  if (!text) return text;
  // "don't" → "dont", "Karim's" → "Karims": one word, not three.
  const joined = text.replace(/([A-Za-z])['’]([A-Za-z])/g, '$1$2');
  return joined
    .split(SENTENCE_END)
    .map((sentence) => {
      const tokens = sentence.match(TOKEN) || [];
      const lang = sentenceLanguage(tokens);
      return tokens.map((t) => (isRoman(t) ? convertWord(t, lang) : t)).join('');
    })
    .join('');
}

// ─── Learned words (looked up once, saved in this browser) ───────────────────

const LOOKUP_URL = 'https://inputtools.google.com/request';
const LOOKUP_TIMEOUT_MS = 4000;
/** Parallel lookups at a time (a long step can have many new words). */
const LOOKUP_BATCH = 6;
/** Oldest saved words are dropped beyond this. */
const MAX_LEARNED = 5000;

/** Roman word (lowercase) → Devanagari, from earlier lookups. */
const learned = loadMap(LS_HINGLISH_WORDS);
/** Roman word (lowercase) → Devanagari, fixed by hand. Beats everything. */
const overrides = loadMap(LS_HINGLISH_OVERRIDES);

function loadMap(storageKey) {
  try {
    return new Map(
      Object.entries(JSON.parse(globalThis.localStorage?.getItem(storageKey) || '{}')),
    );
  } catch {
    return new Map();
  }
}

function saveMap(storageKey, map, max = Infinity) {
  try {
    const kept = [...map].slice(-max);
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage full or blocked: the words still work for this session.
  }
}

function saveLearned() {
  saveMap(LS_HINGLISH_WORDS, learned, MAX_LEARNED);
}

/** One word → Devanagari via the transliteration service, or null. */
async function lookupWord(word) {
  try {
    const params = new URLSearchParams({
      text: word,
      itc: 'hi-t-i0-und',
      num: '1',
      ie: 'utf-8',
      oe: 'utf-8',
    });
    const response = await fetch(`${LOOKUP_URL}?${params}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    const data = await response.json();
    const answer = data?.[0] === 'SUCCESS' ? data[1]?.[0]?.[1]?.[0] : null;
    // Accept only a plain Devanagari word.
    return typeof answer === 'string' && /^[\u0900-\u097F]+$/.test(answer) ? answer : null;
  } catch {
    return null; // offline, blocked or changed: the rules take over
  }
}

/** Words of `text` that neither the lists nor earlier lookups know. */
function unknownWords(text) {
  const words = text.replace(/([A-Za-z])['’]([A-Za-z])/g, '$1$2').match(/[A-Za-z]+/g) || [];
  return [...new Set(words.filter((w) => !isListed(w)).map((w) => w.toLowerCase()))].filter(
    (w) => !learned.has(w),
  );
}

/**
 * Like toDevanagari, but first looks up (once) and saves every word the lists
 * don't know — use this before speaking.
 * @param {string} text
 * @param {{ lookup?: boolean }} [options]  lookup: false = saved words and rules only
 * @returns {Promise<string>}
 */
export async function toDevanagariAsync(text, { lookup = true } = {}) {
  await loadEnglishDictionary();
  const missing = lookup ? unknownWords(text || '') : [];
  await lookUpWords(missing);
  return toDevanagari(text);
}

/** Looks up (6 at a time) and saves each word. */
async function lookUpWords(missing) {
  let changed = false;
  for (let i = 0; i < missing.length; i += LOOKUP_BATCH) {
    const batch = missing.slice(i, i + LOOKUP_BATCH);
    const answers = await Promise.all(batch.map(lookupWord));
    batch.forEach((word, k) => {
      if (answers[k]) {
        learned.set(word, answers[k]);
        changed = true;
      }
    });
  }
  if (changed) saveLearned();
}

/** How many words have been looked up and saved (shown in Settings). */
export function learnedWordCount() {
  return learned.size;
}

/** Forgets every saved word (Settings → Clear). */
export function forgetLearnedWords() {
  learned.clear();
  saveLearned();
}

// ─── Hand fixes (Settings → "Check my courses") ──────────────────────────────

/**
 * Saves how a word should be read, or forgets the fix (null / empty).
 * @param {string} word Roman word
 * @param {string | null} spelling Devanagari, or Roman typed the way it sounds ("baar-kod")
 */
export function setWordOverride(word, spelling) {
  const key = word.toLowerCase();
  const devanagari = spelling ? respell(spelling) : '';
  if (devanagari) overrides.set(key, devanagari);
  else overrides.delete(key);
  saveMap(LS_HINGLISH_OVERRIDES, overrides);
  return devanagari || null;
}

/**
 * Devanagari for a fix typed in either script. Roman is read letter by letter
 * the English way (ट/ड, no silent e): "baar-kod" → बारकोड, "kare" → करे.
 * @param {string} spelling
 */
export function respell(spelling) {
  const text = spelling.trim();
  if (!text || isDevanagari(text)) return text.replace(/\s+/g, ' ');
  return (text.toLowerCase().match(/[a-z]+/g) || [])
    .map((part) => transliterate(part, 'en', false))
    .join('');
}

// ─── Checking whole courses ──────────────────────────────────────────────────

/**
 * @typedef {Object} WordReport
 * @property {string} word        lowercase
 * @property {number} count       times it appears
 * @property {string} example     a sentence it appears in
 * @property {string} spoken      Devanagari the Hindi voice says
 * @property {string} source      see explainWord
 * @property {string} [meant]     the word it was read as (spelling / corrected)
 */

/**
 * Every Roman word in `texts`, how a Hindi voice reads it and why. Unknown
 * words are looked up first (once, unless lookup is off), so this also
 * "teaches" the voice every word of the courses ahead of time.
 * @param {string[]} texts
 * @param {{ lookup?: boolean }} [options]
 * @returns {Promise<WordReport[]>} most frequent first
 */
export async function analyzeTexts(texts, { lookup = true } = {}) {
  await loadEnglishDictionary();
  const all = texts.filter(Boolean).join('\n');
  if (lookup) await lookUpWords(unknownWords(all));
  /** @type {Map<string, WordReport>} */
  const words = new Map();
  const joined = all.replace(/([A-Za-z])['’]([A-Za-z])/g, '$1$2');
  for (const sentence of joined.split(SENTENCE_END)) {
    const tokens = sentence.match(TOKEN) || [];
    const lang = sentenceLanguage(tokens);
    for (const token of tokens) {
      if (!isRoman(token)) continue;
      const key = token.toLowerCase();
      const seen = words.get(key);
      if (seen) {
        seen.count += 1;
        continue;
      }
      const { text, source, meant } = explainWord(token, lang);
      words.set(key, {
        word: key,
        count: 1,
        example: sentence.trim().slice(0, 140),
        spoken: text,
        source,
        ...(meant ? { meant } : {}),
      });
    }
  }
  return [...words.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

// ─── Devanagari → Hinglish (voice typing) ────────────────────────────────────

/** Devanagari word → Roman, from every list (first spelling wins: है → hai). */
let romanOf = null;

function buildRomanOf() {
  romanOf = new Map();
  const add = (roman, devanagari) => {
    if (roman.length > 1 && !romanOf.has(devanagari)) romanOf.set(devanagari, roman);
  };
  for (const [roman, dev] of overrides) add(roman, dev);
  for (const [roman, dev] of Object.entries(HINDI_WORDS)) add(roman, dev);
  for (const [roman, dev] of LEXICON) add(roman, dev);
  for (const [roman, [dev]] of Object.entries(AMBIGUOUS)) add(roman, dev);
  for (const [roman, dev] of Object.entries(ENGLISH_WORDS)) add(roman, dev);
  for (const [roman, dev] of learned) add(roman, dev);
}

const ROMAN_CONSONANTS = {
  क: 'k',
  ख: 'kh',
  ग: 'g',
  घ: 'gh',
  ङ: 'n',
  च: 'ch',
  छ: 'chh',
  ज: 'j',
  झ: 'jh',
  ञ: 'n',
  ट: 't',
  ठ: 'th',
  ड: 'd',
  ढ: 'dh',
  ण: 'n',
  त: 't',
  थ: 'th',
  द: 'd',
  ध: 'dh',
  न: 'n',
  प: 'p',
  फ: 'ph',
  ब: 'b',
  भ: 'bh',
  म: 'm',
  य: 'y',
  र: 'r',
  ल: 'l',
  व: 'v',
  श: 'sh',
  ष: 'sh',
  स: 's',
  ह: 'h',
  क़: 'q',
  ख़: 'kh',
  ग़: 'g',
  ज़: 'z',
  ड़: 'd',
  ढ़: 'dh',
  फ़: 'f',
  य़: 'y',
};
/** [medial, word-final] */
const ROMAN_VOWELS = {
  अ: ['a', 'a'],
  आ: ['aa', 'a'],
  इ: ['i', 'i'],
  ई: ['ee', 'i'],
  उ: ['u', 'u'],
  ऊ: ['oo', 'u'],
  ऋ: ['ri', 'ri'],
  ए: ['e', 'e'],
  ऐ: ['ai', 'ai'],
  ओ: ['o', 'o'],
  औ: ['au', 'au'],
  ऑ: ['o', 'o'],
  'ा': ['aa', 'a'],
  'ि': ['i', 'i'],
  'ी': ['ee', 'i'],
  'ु': ['u', 'u'],
  'ू': ['oo', 'u'],
  'ृ': ['ri', 'ri'],
  'े': ['e', 'e'],
  'ै': ['ai', 'ai'],
  'ो': ['o', 'o'],
  'ौ': ['au', 'au'],
  'ॉ': ['o', 'o'],
};
const NUKTA = '़';

/** Rule-based Devanagari → Roman with Hindi schwa deletion ("करना" → karna). */
function romanize(word) {
  // Syllables: { c: consonant or '', v: vowel key, 'a' (inherent) or null (halant) }
  const syl = [];
  const chars = [...word.normalize('NFC')];
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i];
    if (chars[i + 1] === NUKTA) ch += chars[++i];
    if (ch in ROMAN_CONSONANTS) syl.push({ c: ROMAN_CONSONANTS[ch], v: 'a' });
    else if (ch === HALANT && syl.length) syl.at(-1).v = null;
    else if (ch in ROMAN_VOWELS) {
      const last = syl.at(-1);
      if (ch.length === 1 && /[\u093E-\u094C]/.test(ch) && last) last.v = ch;
      else syl.push({ c: '', v: ch });
    } else if ((ch === ANUSVARA || ch === 'ँ') && syl.length) syl.at(-1).nasal = true;
  }
  // Inherent "a" is dropped at the end and between two vowels (right to left).
  const lastSyl = syl.at(-1);
  if (syl.length > 1 && lastSyl?.v === 'a' && lastSyl.c) lastSyl.v = null;
  for (let i = syl.length - 2; i >= 1; i--) {
    if (syl[i].v === 'a' && syl[i].c && !syl[i].nasal && syl[i - 1].v && syl[i + 1].v) {
      syl[i].v = null;
    }
  }
  return syl
    .map((s, i) => {
      const final = i === syl.length - 1;
      const vowel = s.v === null ? '' : s.v === 'a' ? 'a' : ROMAN_VOWELS[s.v][final ? 1 : 0];
      return s.c + vowel + (s.nasal ? 'n' : '');
    })
    .join('');
}

/**
 * Devanagari → Roman Hinglish ("बारकोड स्कैन करें" → "barcode scan karein"):
 * listed words get their usual spelling, others are spelled by rules. Roman
 * text, digits and punctuation stay as they are.
 * @param {string} text
 */
export function toHinglish(text) {
  if (!text || !isDevanagari(text)) return text;
  buildRomanOf();
  return text
    .replace(/[\u0900-\u097F]+/g, (word) => {
      const clean = word.replace(/[।॥]/g, '');
      const roman = romanOf.get(clean) ?? romanize(clean);
      return roman + (word.endsWith('।') || word.endsWith('॥') ? '.' : '');
    })
    .replace(/\s*[।॥]/g, '.');
}

// ─── Speaking naturally (Hindi voices) ───────────────────────────────────────

/** Words that start a new thought: a short pause before them in a long sentence. */
const PAUSE_BEFORE = ['फिर', 'लेकिन', 'मगर', 'ताकि', 'क्योंकि', 'जिससे', 'वरना', 'इसलिए'];
const SYMBOL_WORDS = [
  [/\s*(?:->|→|›|»|>)\s*/g, ', फिर '], // Settings > Users
  [/\s*&\s*/g, ' और '],
  [/(\d)\s*%/g, '$1 प्रतिशत'],
  [/\s*\+\s*/g, ' प्लस '],
  [/(?<=\S)\s*\/\s*(?=\S)/g, ' या '], // size/colour
  [/[“”"«»]/g, ''],
  [/\s*[()[\]{}]\s*/g, ', '],
  [/\s*[-–—]{1,2}\s+/g, ', '],
];

/**
 * Text as the Hindi voice should hear it — captions are not changed:
 *   - symbols said as words ("Settings > Users" → "…, फिर …", "/" → या)
 *   - "." ends a sentence as "।", so the voice uses Hindi sentence intonation
 *   - a short pause (comma) before फिर, लेकिन, ताकि … in a long sentence, and
 *     before तो after अगर / जब ("अगर X है, तो Y"), instead of one breathless run
 * @param {string} devanagari  output of toDevanagari
 */
export function shapeForHindiSpeech(devanagari) {
  let text = devanagari;
  for (const [pattern, words] of SYMBOL_WORDS) text = text.replace(pattern, words);
  text = text.replace(/(^|[^\d])\.(?=\s|$)/g, '$1।');
  return text
    .split(/(?<=[।?!\n])/)
    .map((sentence) => {
      const words = sentence.trim().split(/\s+/);
      if (words.length < 8) return sentence;
      let shaped = sentence;
      for (const word of PAUSE_BEFORE) {
        shaped = shaped.replace(new RegExp(`([^,।\\s])\\s+(?=${word}(\\s|$))`, 'g'), '$1, ');
      }
      if (/^\s*(अगर|जब|यदि)\s/.test(shaped)) shaped = shaped.replace(/([^,\s])\s+(?=तो\s)/, '$1, ');
      return shaped;
    })
    .join('')
    .replace(/\s*,\s*(?=[,।])/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
