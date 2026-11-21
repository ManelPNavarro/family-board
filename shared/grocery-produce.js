import { searchKey } from './grocery-suggestions.js';

const produceNames = new Set(`
  poma pomes pera peres plàtan plàtans banana bananes taronja taronges
  mandarina mandarines llimona llimones llima llimes aranja aranges
  kiwi kiwis raïm raïms maduixa maduixes maduixot maduixots gerd gerds
  nabiu nabius móra móres cirera cireres préssec préssecs nectarina nectarines
  albercoc albercocs pruna prunes figa figues magrana magranes
  meló melons síndria síndries pinya pinyes mango mangos papaia papaies
  alvocat alvocats caqui caquis xirimoia xirimoies nespra nespres
  tomàquet tomàquets tomata tomates tomàtiga tomàtigues
  pebrot pebrots patata patates creïlla creïlles moniato moniatos
  pastanaga pastanagues carlota carlotes ceba cebes
  all alls porro porros calçot calçots api nap naps rave raves
  remolatxa remolatxes cogombre cogombres carbassó carbassons
  albergínia albergínies carabassó carabassons carbassa carbasses
  carabassa carabasses col cols coliflor coliflors bròquil bròquils
  bròcoli bròcolis enciam enciams escarola escaroles espinac espinacs
  bleda bledes ruca canonge canonges endívia endívies
  carxofa carxofes espàrrec espàrrecs mongeta mongetes pèsol pèsols
  fava faves xirivia xirivies bolet bolets xampinyó xampinyons
`.trim().split(/\s+/).map(searchKey));

const prepared = /^(?:fregi[dt]|tritura[dt]|ratlla[dt]|asseca[dt]|confita[dt]|congela[dt]|xips\b|(?:sec(?:a|s)?|seques)\b|en (?:conserva|pols)\b|de pot\b)/;

export function isFreshProduce(title) {
  const name = searchKey(title).replace(
    /^\d+(?:[.,]\d+)?\s*(?:(?:kg|g|gr|quilos?|grams?|unitats?|manats?)\b\s*)?(?:de\s+|d['’])?/,
    '',
  );
  const [word] = name.match(/^\p{L}+/u) ?? [];
  return produceNames.has(word) && !prepared.test(name.slice(word.length).trimStart());
}
