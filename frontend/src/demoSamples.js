// Demo helpers: synthetic sample details and a sample complaint page drawn in the browser, so OCR has something to read
// on stage. Only offered when the server is in demo mode. Every name, number and place is invented.
export const SAMPLE_DETAILS = {
  kn: {
    identity: { name: 'ಕಾವ್ಯ ಗೌಡ', phone: '9845012345', address: '14, 2ನೇ ಅಡ್ಡರಸ್ತೆ, ಹೊಸಹಳ್ಳಿ', pincode: '561203', father_name: 'ಮಂಜುನಾಥ ಗೌಡ',
      mother_name: '', guardian_name: '', school_or_workplace: 'ಸರ್ಕಾರಿ ಪ್ರೌಢ ಶಾಲೆ, ಹೊಸಹಳ್ಳಿ', email: '', age: '15' },
    incident: { date: '2026-11-05', time: '18:00', locality: 'Hosahalli', pincode: '561203', place: 'ಶಾಲೆಯಿಂದ ಮನೆಗೆ ಹೋಗುವ ದಾರಿ' },
    accused: 'ಸುಮಾರು 35 ವರ್ಷದ ವ್ಯಕ್ತಿ, ಕೆಂಪು ಅಂಗಿ',
  },
  hi: {
    identity: { name: 'अंजलि गुप्ता', phone: '9810098100', address: '27, शिव नगर, रामपुर', pincode: '110005', father_name: 'मनोज गुप्ता',
      mother_name: '', guardian_name: '', school_or_workplace: 'राजकीय कन्या विद्यालय, रामपुर', email: '', age: '16' },
    incident: { date: '2026-11-03', time: '17:30', locality: 'करोल बाग', pincode: '110005', place: 'स्कूल से घर का रास्ता' },
    accused: 'लगभग 40 साल का आदमी, सफ़ेद कुर्ता',
  },
  en: {
    identity: { name: 'Ananya Reddy', phone: '9900112233', address: '8, 3rd Main, Kengeri Satellite Town', pincode: '560060', father_name: 'Ramesh Reddy',
      mother_name: '', guardian_name: '', school_or_workplace: 'Little Flower Public School, Kengeri', email: '', age: '17' },
    incident: { date: '2026-11-08', time: '16:45', locality: 'Kengeri', pincode: '560060', place: 'Outside the school gate' },
    accused: 'A man of about 40 who drives the school van.',
  },
}

const PAGES = {
  kn: ['ಠಾಣಾಧಿಕಾರಿಗಳಿಗೆ,', 'ಬೆಂಗಳೂರು ದಕ್ಷಿಣ ಪೊಲೀಸ್ ಠಾಣೆ.', '', 'ನನ್ನ ಹೆಸರು ಕಾವ್ಯ ಗೌಡ. ನನಗೆ 15 ವರ್ಷ.', 'ನಾನು ಹೊಸಹಳ್ಳಿಯ ಸರ್ಕಾರಿ ಪ್ರೌಢ ಶಾಲೆಯಲ್ಲಿ ಓದುತ್ತೇನೆ.',
    '5 ನವೆಂಬರ್ ಸಂಜೆ ಶಾಲೆಯಿಂದ ಮನೆಗೆ ಬರುವಾಗ ಒಬ್ಬ ವ್ಯಕ್ತಿ', 'ನನ್ನನ್ನು ಹಿಂಬಾಲಿಸಿ ಕೆಟ್ಟದಾಗಿ ವರ್ತಿಸಿದನು.', 'ನನ್ನ ತಂದೆ ಮಂಜುನಾಥ ಗೌಡ ಅವರ ಸಂಖ್ಯೆ 9845012345.',
    'ದಯವಿಟ್ಟು ಕ್ರಮ ಕೈಗೊಳ್ಳಿ.', '', 'ಕಾವ್ಯ ಗೌಡ'],
  hi: ['सेवा में,', 'थाना प्रभारी, नई दिल्ली सेंट्रल पुलिस थाना', '', 'मेरा नाम अंजलि गुप्ता है। मेरी उम्र 16 वर्ष है।', 'मैं राजकीय कन्या विद्यालय, रामपुर में पढ़ती हूँ।',
    '3 नवंबर की शाम स्कूल से लौटते समय एक आदमी ने', 'मेरा पीछा किया और मेरे साथ गलत हरकत की।', 'मेरे पिता मनोज गुप्ता का नंबर 9810098100 है।',
    'कृपया कार्रवाई करें।', '', 'अंजलि गुप्ता'],
  en: ['To the Station House Officer,', 'Bengaluru South Police Station.', '', 'My name is Ananya Reddy. I am 17 years old and I study at',
    'Little Flower Public School, Kengeri. On 8 November, the driver of', 'the school van touched me when I was alone in the van.',
    'My father Ramesh Reddy can be reached on 9900112233.', 'Please take action.', '', 'Ananya Reddy'],
}
const FONTS = { kn: 'Noto Sans Kannada', hi: 'Noto Sans Devanagari', en: 'Inter' }

/** Draws the sample complaint onto a paper-coloured canvas and returns it as a PNG data URL. */
export async function samplePage(lang) {
  const lines = PAGES[lang]
  const font = `30px "${FONTS[lang]}"`
  await document.fonts.load(font)
  const canvas = document.createElement('canvas')
  canvas.width = 1100
  canvas.height = 120 + lines.length * 60
  const g = canvas.getContext('2d')
  g.fillStyle = '#fbf8f1'
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.fillStyle = '#1f2430'
  g.font = font
  g.textBaseline = 'top'
  lines.forEach((line, i) => g.fillText(line, 70, 60 + i * 60))
  return canvas.toDataURL('image/png')
}
