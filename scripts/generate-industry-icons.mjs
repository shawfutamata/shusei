import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const outputDir = path.resolve('public/icons/industries');

const icons = {
  'it-system': '<rect x="46" y="52" width="164" height="116" rx="17"/><path d="M28 188h200M96 96l-25 24 25 24M160 96l25 24-25 24M142 83l-28 75"/>',
  'web-ad': '<path d="M42 116v30l112 42V74L42 116Z"/><path d="M154 105c29 5 45 20 45 26s-16 21-45 26M70 157l18 49h34l-20-37"/>',
  'video-photo': '<rect x="38" y="57" width="138" height="142" rx="19"/><path d="m176 104 42-25v98l-42-25M92 96l45 32-45 32V96Z"/>',
  'design-print': '<path d="m128 38 72 72-72 108-72-108 72-72Z"/><circle cx="128" cy="112" r="16"/><path d="M128 128v48M83 76l90 90"/>',
  'construction-realestate': '<path d="M32 119 128 42l96 77M52 108v104h152V108M100 212v-66h56v66"/><path d="M174 74V40h28v57"/>',
  'manufacturing-wholesale': '<path d="M29 211V104l53 30v-30l53 30V77h50v134M15 211h226"/><path d="M61 166h22M108 166h22M158 166h22"/>',
  'retail-ec': '<path d="M48 86h160l-12 132H60L48 86Z"/><path d="M88 100V76c0-27 18-44 40-44s40 17 40 44v24"/><circle cx="99" cy="147" r="8"/><circle cx="157" cy="147" r="8"/>',
  'food': '<path d="M35 170h186M48 155c0-48 36-86 80-86s80 38 80 86H48Z"/><path d="M128 69V46M108 46h40M57 194h142"/>',
  'beauty-health': '<path d="M66 194c68 0 116-49 124-134-83 7-133 53-124 134Z"/><path d="M68 190c32-45 66-76 111-114M50 63v-25M37 50h26M198 191v-31M183 176h30"/>',
  'medical-welfare': '<path d="M128 212S48 166 48 101c0-37 48-57 80-19 32-38 80-18 80 19 0 65-80 111-80 111Z"/><path d="M128 105v54M101 132h54"/>',
  'legal-consulting': '<path d="M128 42v170M74 68h108M45 92h58l-29 58-29-58ZM153 92h58l-29 58-29-58Z"/><path d="M42 150c15 18 50 18 65 0M149 150c15 18 50 18 65 0M80 212h96"/>',
  'hr-education': '<circle cx="82" cy="82" r="29"/><circle cx="177" cy="82" r="29"/><path d="M27 180c0-37 24-58 55-58 22 0 39 10 49 29M229 180c0-37-22-58-52-58-19 0-34 8-44 22"/><path d="M86 158c22-9 42-4 42 7 0-11 20-16 42-7v52c-22-9-42-4-42 7 0-11-20-16-42-7v-52Z"/>',
  'finance-insurance': '<path d="M128 35c26 22 53 29 78 31v57c0 46-27 78-78 99-51-21-78-53-78-99V66c25-2 52-9 78-31Z"/><circle cx="128" cy="126" r="39"/><path d="M104 111h48M104 129h48M128 108v47"/>',
  'transport-logistics': '<path d="M25 72h127v106H25V72ZM152 111h38l36 42v25h-74v-67Z"/><circle cx="72" cy="184" r="20"/><circle cx="190" cy="184" r="20"/><path d="M38 112h72M38 141h50"/>',
  'event-entertainment': '<path d="M43 78h170v42c-19 0-19 32 0 32v42H43v-42c19 0 19-32 0-32V78Z"/><path d="m128 99 10 22 24 3-18 17 5 24-21-12-21 12 5-24-18-17 24-3 10-22Z"/>',
  'other': '<circle cx="59" cy="128" r="18" fill="url(#g)" stroke="none"/><circle cx="128" cy="128" r="18" fill="url(#g)" stroke="none"/><circle cx="197" cy="128" r="18" fill="url(#g)" stroke="none"/>',
};

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <defs><linearGradient id="g" x1="25" y1="25" x2="231" y2="231" gradientUnits="userSpaceOnUse"><stop stop-color="#1D4ED8"/><stop offset="1" stop-color="#38BDF8"/></linearGradient></defs>
    <g fill="none" stroke="url(#g)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">${body}</g>
  </svg>`;
}

await fs.mkdir(outputDir, { recursive: true });
await Promise.all(Object.entries(icons).map(async ([name, body]) => {
  await sharp(Buffer.from(svg(body))).png().toFile(path.join(outputDir, `${name}.png`));
}));

console.log(`Generated ${Object.keys(icons).length} transparent PNG icons in ${outputDir}`);
