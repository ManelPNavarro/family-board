import { searchKey } from './grocery-suggestions.js';

// Each group is one product, including plural forms and common Catalan variants.
const produceNames = new Map(`
  poma pomes; pera peres; plàtan plàtans banana bananes; taronja taronges;
  mandarina mandarines clementina clementines; llimona llimones; llima llimes; aranja aranges;
  kiwi kiwis; raïm raïms; maduixa maduixes maduixot maduixots; gerd gerds;
  nabiu nabius; móra móres; cirera cireres; préssec préssecs; nectarina nectarines;
  albercoc albercocs; pruna prunes; figa figues; magrana magranes;
  meló melons; síndria síndries; pinya pinyes; mango mangos; papaia papaies;
  alvocat alvocats; caqui caquis; xirimoia xirimoies; nespra nespres;
  tomàquet tomàquets tomata tomates tomàtiga tomàtigues;
  pebrot pebrots; patata patates creïlla creïlles; moniato moniatos;
  pastanaga pastanagues carlota carlotes; ceba cebes; all alls; porro porros;
  calçot calçots; api; nap naps; rave raves; remolatxa remolatxes; cogombre cogombres;
  carbassó carbassons carabassó carabassons; albergínia albergínies;
  carbassa carbasses carabassa carabasses; col cols; coliflor coliflors;
  bròquil bròquils bròcoli bròcolis; enciam enciams; escarola escaroles;
  espinac espinacs; bleda bledes; ruca; canonge canonges; endívia endívies;
  carxofa carxofes; espàrrec espàrrecs; mongeta mongetes; pèsol pèsols;
  fava faves; xirivia xirivies; bolet bolets; xampinyó xampinyons;
  dàtil dàtils; coco cocos; codony codonys; gingebre;
  colrave colraves; tirabec tirabecs; fonoll fonolls; créixens; julivert
`.split(';').flatMap((group) => {
  const names = searchKey(group).split(/\s+/);
  return names.map((name) => [name, names[0]]);
}));

const prepared = /^(?:fregi[dt]|tritura[dt]|ratlla[dt]|asseca[dt]|confita[dt]|congela[dt]|xips\b|(?:sec(?:a|s)?|seques)\b|en (?:conserva|pols)\b|de pot\b)/;

function produceParts(title) {
  const name = searchKey(title).replace(
    /^\d+(?:[.,]\d+)?\s*(?:(?:kg|g|gr|quilos?|grams?|unitats?|manats?)\b\s*)?(?:de\s+|d['’])?/,
    '',
  );
  const [word] = name.match(/^\p{L}+/u) ?? [];
  const product = produceNames.get(word);
  return product ? { product, qualifier: name.slice(word.length).trim().replace(/\s+/g, ' ') } : null;
}

export function isFreshProduce(title) {
  const parts = produceParts(title);
  return parts !== null && !prepared.test(parts.qualifier);
}

function categoryKey(title) {
  const parts = produceParts(title);
  return parts ? `${parts.product}:${parts.qualifier}` : null;
}

export function groceryProduceDefault(title, history) {
  const writtenName = title.trim().toLocaleLowerCase('ca');
  const key = searchKey(title);
  const exact = history.find((entry) => entry.title.trim().toLocaleLowerCase('ca') === writtenName)
    ?? history.find((entry) => searchKey(entry.title) === key);
  if (exact) return exact.produce;

  const category = categoryKey(title);
  const equivalent = category && history.find((entry) => categoryKey(entry.title) === category);
  return equivalent?.produce ?? isFreshProduce(title);
}
