export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
] as const;

export const SUPPORTED_CURRENCIES = [
  { code: 'NPR', name: 'Nepalese Rupee', symbol: 'रू', locale: 'ne-NP' },
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', locale: 'hi-IN' },
] as const;

export const SUPPORTED_TIMEZONES = [
  { value: 'Asia/Kathmandu', label: 'Kathmandu (UTC+5:45)', offset: '+05:45' },
  { value: 'Asia/Kolkata', label: 'Kolkata (UTC+5:30)', offset: '+05:30' },
  { value: 'UTC', label: 'UTC (UTC+0:00)', offset: '+00:00' },
] as const;

export const NEPAL_PROVINCES = [
  { code: '1', name: 'Koshi Province', nameNe: 'कोशी प्रदेश' },
  { code: '2', name: 'Madhesh Province', nameNe: 'मधेश प्रदेश' },
  { code: '3', name: 'Bagmati Province', nameNe: 'बागमती प्रदेश' },
  { code: '4', name: 'Gandaki Province', nameNe: 'गण्डकी प्रदेश' },
  { code: '5', name: 'Lumbini Province', nameNe: 'लुम्बिनी प्रदेश' },
  { code: '6', name: 'Karnali Province', nameNe: 'कर्णाली प्रदेश' },
  { code: '7', name: 'Sudurpashchim Province', nameNe: 'सुदुरपश्चिम प्रदेश' },
] as const;

export const NEPAL_DISTRICTS: Record<string, Array<{ code: string; name: string; nameNe: string }>> = {
  '1': [
    { code: 'BHO', name: 'Bhojpur', nameNe: 'भोजपुर' },
    { code: 'DHU', name: 'Dhankuta', nameNe: 'धनकुटा' },
    { code: 'ILA', name: 'Ilam', nameNe: 'इलाम' },
    { code: 'JHA', name: 'Jhapa', nameNe: 'झापा' },
    { code: 'KHO', name: 'Khotang', nameNe: 'खोटाङ' },
    { code: 'MOR', name: 'Morang', nameNe: 'मोरङ' },
    { code: 'OKH', name: 'Okhaldhunga', nameNe: 'ओखलढुङ्गा' },
    { code: 'PAN', name: 'Panchthar', nameNe: 'पाञ्चथर' },
    { code: 'SANK', name: 'Sankhuwasabha', nameNe: 'संखुवासभा' },
    { code: 'SOL', name: 'Solukhumbu', nameNe: 'सोलुखुम्बु' },
    { code: 'SUN', name: 'Sunsari', nameNe: 'सुनसरी' },
    { code: 'TAP', name: 'Taplejung', nameNe: 'ताप्लेजुङ' },
    { code: 'TER', name: 'Terhathum', nameNe: 'तेह्रथुम' },
    { code: 'UDA', name: 'Udayapur', nameNe: 'उदयपुर' },
  ],
  '3': [
    { code: 'BHA', name: 'Bhaktapur', nameNe: 'भक्तपुर' },
    { code: 'CHI', name: 'Chitwan', nameNe: 'चितवन' },
    { code: 'DHAD', name: 'Dhading', nameNe: 'धादिङ' },
    { code: 'DOL', name: 'Dolakha', nameNe: 'दोलखा' },
    { code: 'KATH', name: 'Kathmandu', nameNe: 'काठमाडौं' },
    { code: 'KAV', name: 'Kavrepalanchok', nameNe: 'काभ्रेपलान्चोक' },
    { code: 'LAL', name: 'Lalitpur', nameNe: 'ललितपुर' },
    { code: 'MAK', name: 'Makwanpur', nameNe: 'मकवानपुर' },
    { code: 'NUW', name: 'Nuwakot', nameNe: 'नुवाकोट' },
    { code: 'RAS', name: 'Rasuwa', nameNe: 'रसुवा' },
    { code: 'RAU', name: 'Rautahat', nameNe: 'रौतहट' },
    { code: 'SIN', name: 'Sindhuli', nameNe: 'सिन्धुली' },
    { code: 'SIND', name: 'Sindhupalchok', nameNe: 'सिन्धुपाल्चोक' },
  ],
};

export const NEPAL_MUNICIPALITIES = [
  'Kathmandu Metropolitan City',
  'Lalitpur Metropolitan City',
  'Bharatpur Metropolitan City',
  'Pokhara Metropolitan City',
  'Biratnagar Metropolitan City',
  'Birgunj Metropolitan City',
  'Dharan Sub-Metropolitan City',
  'Butwal Sub-Metropolitan City',
  'Hetauda Sub-Metropolitan City',
  'Itahari Sub-Metropolitan City',
  'Janakpur Sub-Metropolitan City',
] as const;

export const DEFAULT_PAGINATION = {
  page: 1,
  limit: 20,
  maxLimit: 100,
} as const;

export const PASSWORD_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxAge: 90, // days
  historyCount: 5,
} as const;

export const SESSION_CONFIG = {
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  maxConcurrentSessions: 5,
  inactivityTimeout: 30 * 60 * 1000, // 30 minutes
} as const;

export const RATE_LIMITS = {
  login: { windowMs: 15 * 60 * 1000, max: 5 },
  register: { windowMs: 60 * 60 * 1000, max: 3 },
  passwordReset: { windowMs: 60 * 60 * 1000, max: 3 },
  api: { windowMs: 60 * 1000, max: 100 },
  search: { windowMs: 60 * 1000, max: 30 },
} as const;

export const FILE_UPLOAD_LIMITS = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx'],
} as const;

export const QR_CODE_CONFIG = {
  patient: { width: 200, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } },
  prescription: { width: 150, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } },
  invoice: { width: 150, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } },
  sample: { width: 100, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } },
} as const;

export const BIKRAM_SAMBAT_EPOCH = new Date('1943-04-14'); // BS 2000-01-01 = AD 1943-04-14

export const ICD10_CATEGORIES = [
  { code: 'A00-B99', name: 'Certain infectious and parasitic diseases' },
  { code: 'C00-D49', name: 'Neoplasms' },
  { code: 'D50-D89', name: 'Diseases of the blood and blood-forming organs' },
  { code: 'E00-E89', name: 'Endocrine, nutritional and metabolic diseases' },
  { code: 'F00-F99', name: 'Mental, behavioral and neurodevelopmental disorders' },
  { code: 'G00-G99', name: 'Diseases of the nervous system' },
  { code: 'H00-H59', name: 'Diseases of the eye and adnexa' },
  { code: 'H60-H95', name: 'Diseases of the ear and mastoid process' },
  { code: 'I00-I99', name: 'Diseases of the circulatory system' },
  { code: 'J00-J99', name: 'Diseases of the respiratory system' },
  { code: 'K00-K95', name: 'Diseases of the digestive system' },
  { code: 'L00-L99', name: 'Diseases of the skin and subcutaneous tissue' },
  { code: 'M00-M99', name: 'Diseases of the musculoskeletal system' },
  { code: 'N00-N99', name: 'Diseases of the genitourinary system' },
  { code: 'O00-O9A', name: 'Pregnancy, childbirth and the puerperium' },
  { code: 'P00-P96', name: 'Certain conditions originating in the perinatal period' },
  { code: 'Q00-Q99', name: 'Congenital malformations, deformations and chromosomal abnormalities' },
  { code: 'R00-R99', name: 'Symptoms, signs and abnormal clinical and laboratory findings' },
  { code: 'S00-T88', name: 'Injury, poisoning and certain other consequences of external causes' },
  { code: 'V00-Y99', name: 'External causes of morbidity' },
  { code: 'Z00-Z99', name: 'Factors influencing health status and contact with health services' },
] as const;