// Font có đủ dấu tiếng Việt, đóng gói sẵn (không cần mạng khi dựng video).
import '@fontsource/anton/vietnamese-400.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/montserrat/vietnamese-600.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/vietnamese-800.css';
import '@fontsource/montserrat/latin-800.css';
import '@fontsource/be-vietnam-pro/vietnamese-500.css';
import '@fontsource/be-vietnam-pro/latin-500.css';
import '@fontsource/be-vietnam-pro/vietnamese-800.css';
import '@fontsource/be-vietnam-pro/latin-800.css';
import '@fontsource/oswald/vietnamese-600.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/playfair-display/vietnamese-600.css';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/vietnamese-600-italic.css';
import '@fontsource/playfair-display/latin-600-italic.css';
import { continueRender, delayRender } from 'remotion';
import { FONTS } from './templates/catalog.js';

const handle = delayRender('Đang nạp font');
const loads = [
  ...Object.values(FONTS).map((f) => `${f.weight} 48px "${f.family}"`),
  '500 48px "Be Vietnam Pro"',
  '600 48px "Montserrat"',
  'italic 600 48px "Playfair Display"',
].map((spec) => document.fonts.load(spec, 'Tiếng Việt ĐẸP ỨNG Ơ'));
Promise.all(loads)
  .catch(() => {})
  .then(() => continueRender(handle));

export const fontFamily = (key) => `"${(FONTS[key] || FONTS.montserrat).family}", "Be Vietnam Pro", sans-serif`;
export const fontWeight = (key) => (FONTS[key] || FONTS.montserrat).weight;
